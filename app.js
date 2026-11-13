
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  writeBatch,
  runTransaction,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = id => document.getElementById(id);

const names = [
  'Dona Helena',
  'Sr. Augusto',
  'Dona Lúcia',
  'Sr. Roberto',
  'Dona Teresa',
  'Sr. Antônio'
];

let generation = 0;
let profile = null;
let isAdmin = false;

const esc = value => String(value ?? '').replace(
  /[&<>"']/g,
  char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char])
);

const ref = (collectionName, id) =>
  doc(db, collectionName, String(id));

function msg(text, error = false) {
  const el = $('message');
  if (el) {
    el.textContent = text;
    el.className = error ? 'error' : 'ok';
  }
}

function report(text, error = false) {
  msg(text, error);
  alert(text);
}

function errorText(error) {
  return error?.code || error?.message || String(error);
}

// AUTENTICAÇÃO

$('loginForm').onsubmit = async event => {
  event.preventDefault();
  $('enter').disabled = true;
  msg('Autenticando...');

  try {
    await signInWithEmailAndPassword(
      auth,
      $('email').value.trim(),
      $('password').value
    );
  } catch (error) {
    msg('Falha no login: ' + errorText(error), true);
  } finally {
    $('enter').disabled = false;
    $('password').value = '';
  }
};

$('logout').onclick = () => signOut(auth);
$('refresh').onclick = () => load();

onAuthStateChanged(auth, async user => {
  generation++;

  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('identity').textContent = '';

  if (!user) {
    msg('Entre com sua conta.');
    return;
  }

  await load();
});

async function load() {
  const user = auth.currentUser;
  if (!user) return;

  const ticket = ++generation;
  msg('Carregando permissões...');

  try {
    // Uma leitura negada não impede a outra.
    const [adminResult, studentResult] =
      await Promise.allSettled([
        getDoc(ref('seminarios_admins', user.uid)),
        getDoc(ref('seminarios_students', user.uid))
      ]);

    if (ticket !== generation) return;

    if (
      adminResult.status === 'rejected' &&
      studentResult.status === 'rejected'
    ) {
      throw new Error(
        'Não foi possível consultar as permissões no Firestore.'
      );
    }

    isAdmin =
      adminResult.status === 'fulfilled' &&
      adminResult.value.exists() &&
      adminResult.value.data().active === true;

    profile =
      studentResult.status === 'fulfilled' &&
      studentResult.value.exists()
        ? studentResult.value.data()
        : null;

    if (!isAdmin && (!profile || profile.active !== true)) {
      msg('Conta sem cadastro ativo no laboratório.', true);
      return;
    }

    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');

    $('identity').textContent =
      (user.email || 'Conta autenticada') +
      (isAdmin ? ' · Professor' : ' · Estudante');

    msg('');

    if (isAdmin) {
      await teacher();
    } else {
      await student();
    }

  } catch (error) {
    if (ticket === generation) {
      msg('Falha ao carregar: ' + errorText(error), true);
    }
  }
}

// PAINEL DO PROFESSOR

async function teacher() {
  const w = $('workspace');

  w.innerHTML = `
    <div class="card">
      <h2>Painel do professor</h2>
      <p>
        Verifique os seis grupos e vincule estudantes
        já criados no Firebase Authentication.
      </p>
      <button type="button" id="seed">
        Verificar e inicializar grupos
      </button>
    </div>

    <div class="card">
      <h2>Cadastrar estudante</h2>

      <form id="enroll">
        <label>
          UID do Authentication
          <input id="uid" required>
        </label>

        <label>
          Nome completo
          <input id="name" required minlength="5">
        </label>

        <label>
          E-mail do Authentication
          <input id="studentEmail" type="email" required>
        </label>

        <label>
          Código PSI001–PSI060
          <input
            id="code"
            pattern="PSI(00[1-9]|0[1-5][0-9]|060)"
            required
            placeholder="PSI001"
          >
        </label>

        <button type="submit">
          Registrar estudante
        </button>
      </form>
    </div>

    <div class="card">
      <h2>Grupos e estudantes</h2>
      <div id="teacherData">Carregando...</div>
    </div>
  `;

  // VERIFICAÇÃO DOS GRUPOS

  $('seed').onclick = async () => {
    const button = $('seed');
    button.disabled = true;

    try {
      const batch = writeBatch(db);
      let changes = 0;

      for (let i = 1; i <= 6; i++) {
        const groupRef = ref('seminarios_groups', i);
        const snapshot = await getDoc(groupRef);

        if (!snapshot.exists()) {
          throw new Error(`Grupo ${i} não encontrado.`);
        }

        const data = snapshot.data();

        if (data.caseId !== String(i)) {
          throw new Error(
            `O caseId do Grupo ${i} está incorreto.`
          );
        }

        if (
          !Object.prototype.hasOwnProperty.call(
            data,
            'members'
          )
        ) {
          batch.update(groupRef, {members: {}});
          changes++;

        } else if (
          typeof data.members !== 'object' ||
          data.members === null ||
          Array.isArray(data.members)
        ) {
          throw new Error(
            `Campo members inválido no Grupo ${i}.`
          );
        }
      }

      if (changes > 0) {
        await batch.commit();
      }

      report(
        `Verificação concluída. ${changes} grupo(s) inicializado(s).`
      );

      await teacherData();

    } catch (error) {
      report(
        'Erro na inicialização: ' + errorText(error),
        true
      );

    } finally {
      button.disabled = false;
    }
  };

  // CADASTRO DE ESTUDANTES

  $('enroll').onsubmit = async event => {
    event.preventDefault();

    const button = event.submitter;
    if (button) button.disabled = true;

    const uid = $('uid').value.trim();
    const name = $('name').value.trim();
    const email = $('studentEmail').value.trim();
    const code = $('code').value.trim().toUpperCase();

    try {
      if (
        !/^PSI(00[1-9]|0[1-5][0-9]|060)$/.test(code)
      ) {
        throw new Error('Código inválido.');
      }

      if (!uid) {
        throw new Error(
          'Informe o UID do Authentication.'
        );
      }

      const batch = writeBatch(db);

      batch.set(
        ref('seminarios_codes', code),
        {uid}
      );

      batch.set(
        ref('seminarios_students', uid),
        {
          uid,
          name,
          email,
          code,
          group: null,
          active: true
        }
      );

      await batch.commit();

      report('Estudante registrado no Firestore.');

      $('enroll').reset();
      await teacherData();

    } catch (error) {
      report(
        'Erro no cadastro: ' + errorText(error),
        true
      );

    } finally {
      if (button) button.disabled = false;
    }
  };

  await teacherData();
}

// LISTAGEM ADMINISTRATIVA

async function teacherData() {
  try {
    const [gs, ss] = await Promise.all([
      getDocs(collection(db, 'seminarios_groups')),
      getDocs(collection(db, 'seminarios_students'))
    ]);

    const groups = gs.docs
      .map(d => ({id: d.id, ...d.data()}))
      .sort((a, b) => Number(a.id) - Number(b.id));

    const students = ss.docs
      .map(d => d.data())
      .sort((a, b) =>
        String(a.code || '').localeCompare(
          String(b.code || '')
        )
      );

    const target = $('teacherData');
    if (!target) return;

    target.innerHTML =
      '<h3>Grupos</h3><div class="grid">' +

      groups.map(g => {
        const count =
          Object.keys(g.members || {}).length;

        return `
          <div class="card">
            <strong>
              Grupo ${esc(g.id)} ·
              ${esc(names[Number(g.id) - 1] || '')}
            </strong>

            <p>${count}/10 vagas</p>

            <div class="bar">
              <span style="width:${
                Math.min(100, count * 10)
              }%"></span>
            </div>
          </div>
        `;
      }).join('') +

      '</div><h3>Estudantes</h3>' +

      '<div style="overflow:auto">' +
      '<table>' +
      '<thead><tr>' +
      '<th>Código</th>' +
      '<th>Nome</th>' +
      '<th>Grupo</th>' +
      '<th>Ativo</th>' +
      '</tr></thead><tbody>' +

      students.map(s => `
        <tr>
          <td>${esc(s.code)}</td>
          <td>${esc(s.name)}</td>
          <td>${esc(s.group ?? 'Não escolhido')}</td>
          <td>${s.active ? 'Sim' : 'Não'}</td>
        </tr>
      `).join('') +

      '</tbody></table></div>' +

      '<p class="muted">' +
      'Redistribuição administrativa e auditoria ' +
      'ainda não estão disponíveis. ' +
      'Não altere membros manualmente.' +
      '</p>';

  } catch (error) {
    msg('Erro ao listar: ' + errorText(error), true);
  }
}

// ÁREA DO ESTUDANTE

async function student() {
  const w = $('workspace');

  if (profile.group == null) {
    const snapshots = await Promise.all(
      Array.from(
        {length: 6},
        (_, i) =>
          getDoc(ref('seminarios_groups', i + 1))
      )
    );

    w.innerHTML = `
      <div class="card">
        <h2>Escolha seu grupo</h2>

        <p>
          Você poderá escolher uma única vez.
          Alterações posteriores dependerão do professor.
        </p>

        <div class="grid">
          ${snapshots.map((snapshot, i) => {
            const count = snapshot.exists()
              ? Object.keys(
                  snapshot.data().members || {}
                ).length
              : 10;

            return `
              <div class="card">
                <h3>Grupo ${i + 1}</h3>
                <p>${esc(names[i])}</p>

                <p>
                  ${
                    snapshot.exists()
                      ? count + '/10 vagas'
                      : 'Grupo não preparado'
                  }
                </p>

                <button
                  type="button"
                  data-join="${i + 1}"
                  ${count >= 10 ? 'disabled' : ''}
                >
                  Escolher grupo
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    w.querySelectorAll('[data-join]')
      .forEach(button => {
        button.onclick = () =>
          join(Number(button.dataset.join));
      });

    return;
  }

  const group = profile.group;

  if (
    !Number.isInteger(group) ||
    group < 1 ||
    group > 6
  ) {
    msg('Grupo cadastrado inválido.', true);
    return;
  }

  w.innerHTML = `
    <div class="card">
      <h2>
        Grupo ${group} · ${esc(names[group - 1])}
      </h2>

      <p>Seu código: ${esc(profile.code)}</p>

      <div id="caseText">
        Carregando caso clínico...
      </div>
    </div>

    <div class="card">
      <h2>Investigação individual</h2>

      <p>
        Os checkpoints são registros individuais
        imutáveis. A liberação pedagógica sequencial
        ainda será implementada.
      </p>

      <label>
        Etapa
        <select id="stage">
          ${[1, 2, 3, 4, 5].map(i => `
            <option value="checkpoint${i}">
              Checkpoint ${i}
            </option>
          `).join('')}

          <option value="sintese">
            Síntese individual
          </option>
        </select>
      </label>

      <textarea
        id="response"
        placeholder="Hipótese, evidências favoráveis e contrárias, dúvidas e alternativas (mínimo 20 caracteres)"
      ></textarea>

      <button type="button" id="submitResponse">
        Depositar resposta
      </button>

      <div id="ownResponses"></div>
    </div>
  `;

  try {
    const snapshot = await getDoc(
      ref('seminarios_cases', group)
    );

    $('caseText').textContent = snapshot.exists()
      ? (
          snapshot.data().text ||
          'Caso ainda sem narrativa publicada.'
        )
      : 'Caso ainda não cadastrado pelo professor.';

  } catch (error) {
    $('caseText').textContent =
      'Erro ao abrir caso: ' + errorText(error);
  }

  // ENVIO INDIVIDUAL

  $('submitResponse').onclick = async () => {
    const button = $('submitResponse');
    button.disabled = true;

    const id = $('stage').value;
    const text = $('response').value.trim();

    try {
      if (text.length < 20) {
        throw new Error(
          'Escreva pelo menos 20 caracteres.'
        );
      }

      await setDoc(
        doc(
          db,
          'seminarios_submissions',
          auth.currentUser.uid,
          'items',
          id
        ),
        {
          text,
          group,
          createdAt: serverTimestamp()
        }
      );

      msg('Resposta depositada.');
      $('response').value = '';

      await ownResponses();

    } catch (error) {
      msg(
        'Não foi possível depositar: ' +
        errorText(error),
        true
      );

    } finally {
      button.disabled = false;
    }
  };

  await ownResponses();
}

// CONSULTAR RESPOSTAS INDIVIDUAIS

async function ownResponses() {
  try {
    const snapshot = await getDocs(
      collection(
        db,
        'seminarios_submissions',
        auth.currentUser.uid,
        'items'
      )
    );

    const target = $('ownResponses');
    if (!target) return;

    target.innerHTML =
      '<h3>Respostas depositadas</h3>' +

      (
        snapshot.empty
          ? '<p>Nenhuma ainda.</p>'
          : snapshot.docs.map(d => `
              <p>
                ✓ ${esc(d.id)} ·
                ${esc(
                  (d.data().text || '').slice(0, 90)
                )}...
              </p>
            `).join('')
      );

  } catch (error) {
    msg(
      'Erro ao consultar respostas: ' +
      errorText(error),
      true
    );
  }
}

// ESCOLHA ATÔMICA DE GRUPO

async function join(groupNumber) {
  if (
    !confirm(
      'Confirmar escolha definitiva do Grupo ' +
      groupNumber + '?'
    )
  ) {
    return;
  }

  try {
    await runTransaction(db, async tx => {
      const userRef = ref(
        'seminarios_students',
        auth.currentUser.uid
      );

      const groupRef = ref(
        'seminarios_groups',
        groupNumber
      );

      const [userSnapshot, groupSnapshot] =
        await Promise.all([
          tx.get(userRef),
          tx.get(groupRef)
        ]);

      if (
        !userSnapshot.exists() ||
        !groupSnapshot.exists()
      ) {
        throw new Error(
          'Cadastro ou grupo inexistente.'
        );
      }

      if (userSnapshot.data().active !== true) {
        throw new Error('Cadastro inativo.');
      }

      if (userSnapshot.data().group !== null) {
        throw new Error(
          'Você já está em um grupo.'
        );
      }

      const members =
        groupSnapshot.data().members || {};

      if (Object.keys(members).length >= 10) {
        throw new Error('Grupo completo.');
      }

      tx.update(groupRef, {
        members: {
          ...members,
          [auth.currentUser.uid]: true
        }
      });

      tx.update(userRef, {
        group: groupNumber
      });
    });

    msg('Grupo escolhido com sucesso.');
    await load();

  } catch (error) {
    msg(
      'Não foi possível escolher: ' +
      errorText(error),
      true
    );
  }
}
