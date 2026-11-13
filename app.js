import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
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
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const names=['Dona Helena','Sr. Augusto','Dona Lúcia','Sr. Roberto','Dona Teresa','Sr. Antônio'];
let generation=0,current=null,profile=null,isAdmin=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msg=(s,err=false)=>{$('message').textContent=s;$('message').className=err?'error':'ok'};
const ref=(c,id)=>doc(db,c,String(id));
$('loginForm').onsubmit=async e=>{e.preventDefault();$('enter').disabled=true;msg('Autenticando...');try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(e){msg('Falha no login: '+(e.code||e.message),true)}finally{$('enter').disabled=false;$('password').value=''}};
$('logout').onclick=()=>signOut(auth);$('refresh').onclick=()=>load();
onAuthStateChanged(auth,async user=>{generation++;current=user;$('app').classList.add('hidden');$('login').classList.remove('hidden');$('identity').textContent='';if(!user){msg('Entre com sua conta.');return}await load()});
async function load(){const user=auth.currentUser;if(!user)return;const t=++generation;msg('Carregando permissões...');try{const [a,s]=await Promise.all([getDoc(ref('seminarios_admins',user.uid)),getDoc(ref('seminarios_students',user.uid))]);if(t!==generation)return;isAdmin=a.exists()&&a.data().active===true;profile=s.exists()?s.data():null;if(!isAdmin&&(!profile||profile.active!==true)){msg('Conta sem cadastro ativo no laboratório.',true);return}$('login').classList.add('hidden');$('app').classList.remove('hidden');$('identity').textContent=user.email+(isAdmin?' · Professor':' · Estudante');msg('');if(isAdmin)await teacher();else await student()}catch(e){if(t===generation)msg('Falha ao carregar: '+(e.code||e.message),true)}}
async function teacher(){const w=$('workspace');w.innerHTML='<div class="card"><h2>Painel do professor</h2><p>Cadastre os seis grupos e vincule estudantes já criados no Authentication.</p><button id="seed">Criar seis grupos (uma vez)</button></div><div class="card"><h2>Cadastrar estudante</h2><form id="enroll"><label>UID do Authentication<input id="uid" required></label><label>Nome completo<input id="name" required minlength="5"></label><label>E-mail do Authentication<input id="studentEmail" type="email" required></label><label>Código PSI001–PSI060<input id="code" pattern="PSI(00[1-9]|0[1-5][0-9]|060)" required placeholder="PSI001"></label><button type="submit">Registrar estudante</button></form></div><div class="card"><h2>Grupos e estudantes</h2><div id="teacherData">Carregando...</div></div>';

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
        throw new Error(`O caseId do Grupo ${i} está incorreto.`);
      }

      if (!Object.prototype.hasOwnProperty.call(data, 'members')) {
        batch.update(groupRef, { members: {} });
        changes++;
      } else if (
        typeof data.members !== 'object' ||
        data.members === null ||
        Array.isArray(data.members)
      ) {
        throw new Error(`Campo members inválido no Grupo ${i}.`);
      }
    }

    if (changes > 0) {
      await batch.commit();
    }

    msg(`Verificação concluída. ${changes} grupo(s) inicializado(s).`);
    await teacherData();

  } catch (error) {
    msg(
      'Erro na inicialização: ' + (error.code || error.message),
      true
    );
  } finally {
    button.disabled = false;
  }
};
;
$('enroll').onsubmit=async e=>{e.preventDefault();const uid=$('uid').value.trim(),name=$('name').value.trim(),email=$('studentEmail').value.trim(),code=$('code').value.trim().toUpperCase();try{if(!/^PSI(00[1-9]|0[1-5][0-9]|060)$/.test(code))throw Error('Código inválido');const b=writeBatch(db);b.set(ref('seminarios_codes',code),{uid});b.set(ref('seminarios_students',uid),{uid,name,email,code,group:null,active:true});await b.commit();msg('Estudante registrado.');$('enroll').reset();await teacherData()}catch(e){msg('Erro no cadastro: '+(e.code||e.message),true)}};
await teacherData()}
async function teacherData(){try{const [gs,ss]=await Promise.all([getDocs(collection(db,'seminarios_groups')),getDocs(collection(db,'seminarios_students'))]);const groups=gs.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>Number(a.id)-Number(b.id));const students=ss.docs.map(d=>d.data()).sort((a,b)=>a.code.localeCompare(b.code));$('teacherData').innerHTML='<h3>Grupos</h3><div class="grid">'+groups.map(g=>`<div class="card"><strong>Grupo ${esc(g.id)} · ${esc(names[Number(g.id)-1])}</strong><p>${Object.keys(g.members||{}).length}/10 vagas</p><div class="bar"><span style="width:${Math.min(100,Object.keys(g.members||{}).length*10)}%"></span></div></div>`).join('')+'</div><h3>Estudantes</h3><div style="overflow:auto"><table><thead><tr><th>Código</th><th>Nome</th><th>Grupo</th><th>Ativo</th></tr></thead><tbody>'+students.map(s=>`<tr><td>${esc(s.code)}</td><td>${esc(s.name)}</td><td>${s.group??'Não escolhido'}</td><td>${s.active?'Sim':'Não'}</td></tr>`).join('')+'</tbody></table></div><p class="muted">Redistribuição administrativa segura e auditoria serão habilitadas em uma versão posterior; não altere membros manualmente.</p>'}catch(e){msg('Erro ao listar: '+(e.code||e.message),true)}}
async function student(){const w=$('workspace');if(profile.group==null){const gs=await Promise.all(Array.from({length:6},(_,i)=>getDoc(ref('seminarios_groups',i+1))));w.innerHTML='<div class="card"><h2>Escolha seu grupo</h2><p>Você poderá escolher uma única vez. Depois, alterações exigem intervenção do professor.</p><div class="grid">'+gs.map((g,i)=>{const n=g.exists()?Object.keys(g.data().members||{}).length:10;return `<div class="card"><h3>Grupo ${i+1}</h3><p>${esc(names[i])}</p><p>${g.exists()?n+'/10 vagas':'Grupo não preparado'}</p><button data-join="${i+1}" ${n>=10?'disabled':''}>Escolher grupo</button></div>`}).join('')+'</div></div>';w.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>join(Number(b.dataset.join)));return}
const g=profile.group;w.innerHTML=`<div class="card"><h2>Grupo ${g} · ${esc(names[g-1])}</h2><p>Seu código: ${esc(profile.code)}</p><div id="caseText">Carregando caso clínico...</div></div><div class="card"><h2>Investigação individual</h2><p>Os checkpoints são registros individuais imutáveis. A liberação pedagógica sequencial ainda será implementada.</p><label>Etapa<select id="stage">${[1,2,3,4,5].map(i=>`<option value="checkpoint${i}">Checkpoint ${i}</option>`).join('')}<option value="sintese">Síntese individual</option></select></label><textarea id="response" placeholder="Hipótese, evidências favoráveis e contrárias, dúvidas e alternativas (mínimo 20 caracteres)"></textarea><button id="submitResponse">Depositar resposta</button><div id="ownResponses"></div></div>`;
try{const c=await getDoc(ref('seminarios_cases',g));$('caseText').textContent=c.exists()?(c.data().text||'Caso ainda sem narrativa publicada.'):'Caso ainda não cadastrado pelo professor.'}catch(e){$('caseText').textContent='Erro ao abrir caso: '+(e.code||e.message)};
$('submitResponse').onclick=async()=>{const id=$('stage').value,text=$('response').value.trim();if(text.length<20){msg('Escreva pelo menos 20 caracteres.',true);return}try{await setDoc(doc(db,'seminarios_submissions',auth.currentUser.uid,'items',id),{text,group:g,createdAt:serverTimestamp()});msg('Resposta depositada.');$('response').value='';await ownResponses()}catch(e){msg('Não foi possível depositar (talvez já exista): '+(e.code||e.message),true)}};await ownResponses()}
async function ownResponses(){try{const s=await getDocs(collection(db,'seminarios_submissions',auth.currentUser.uid,'items'));$('ownResponses').innerHTML='<h3>Respostas depositadas</h3>'+(s.empty?'<p>Nenhuma ainda.</p>':s.docs.map(d=>`<p>✓ ${esc(d.id)} · ${esc((d.data().text||'').slice(0,90))}...</p>`).join(''))}catch(e){msg('Erro ao consultar respostas: '+(e.code||e.message),true)}}
async function join(g){if(!confirm('Confirmar escolha definitiva do Grupo '+g+'?'))return;try{await runTransaction(db,async tx=>{const sr=ref('seminarios_students',auth.currentUser.uid),gr=ref('seminarios_groups',g);const [s,group]=await Promise.all([tx.get(sr),tx.get(gr)]);if(!s.exists()||!group.exists())throw Error('Cadastro ou grupo inexistente');if(s.data().group!==null)throw Error('Você já está em um grupo');const members=group.data().members||{};if(Object.keys(members).length>=10)throw Error('Grupo completo');tx.update(gr,{members:{...members,[auth.currentUser.uid]:true}});tx.update(sr,{group:g})});msg('Grupo escolhido com sucesso.');await load()}catch(e){msg('Não foi possível escolher: '+(e.code||e.message),true)}}
