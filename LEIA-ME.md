# SynaptaLab — pacote MVP Spark

Este pacote é uma **primeira implementação funcional**, não a versão completa dos seminários. Ele contém autenticação existente, painel docente com cadastro administrativo, grupos de 10 vagas, escolha única transacional, leitura de caso exclusivo e depósitos individuais imutáveis.

## Instalação

1. Guarde um backup do repositório atual e das regras publicadas.
2. No Firebase Console > Authentication > Método de login, habilite E-mail/senha. A conta do professor e seu documento `seminarios_admins/{UID}` com `active: true` já devem existir.
3. Em `firebase-config.js`, substitua apenas o marcador `COLE_AQUI_A_API_KEY_DO_APP_WEB` pela `apiKey` de **Configurações do projeto > Seus apps > Configuração do SDK > Config**. A configuração do SDK Web é pública; nunca coloque credenciais de conta de serviço ou senhas no repositório.
4. No Firestore > Regras, cole `firestore.rules` e use o **Laboratório de testes** ou Emulator Suite antes de publicar. Teste: professor lê seu admin; aluno sem perfil não lê grupo; aluno matriculado só lê seu caso; aluno não altera outro estudante; aluno não acessa respostas de colegas; 11ª vaga falha. Depois publique.
5. No GitHub `synaptalab-seminarios`, substitua `index.html`, `app.js` e `firebase-config.js` pelos arquivos deste pacote. GitHub Pages deve continuar configurado em `main` / `(root)`.
6. Acesse o site em janela anônima. Entre como professor e clique em **Criar seis grupos**.
7. Para cada aluno, crie uma conta em Firebase Authentication > Usuários > Adicionar usuário, com e-mail e senha provisória, e copie seu **UID**. No painel do professor, registre UID, nome, e-mail e código PSI001–PSI060. Entregue as credenciais de forma privada e exija troca de senha via fluxo de recuperação do Firebase; **não envie senhas por planilhas públicas**.
8. Crie os casos no Firestore, documentos `seminarios_cases/1` a `seminarios_cases/6`, com campo `text` (string) contendo apenas o material liberado para estudantes daquele grupo. **Não inclua gabaritos nem materiais exclusivos do professor nesses documentos.**
9. Aluno autenticado escolhe grupo; transação grava simultaneamente `seminarios_groups/{id}.members.{uid}=true` e `seminarios_students/{uid}.group=id`. O Firestore aplica o limite de dez no servidor.

## Limites intencionais

- Redistribuição administrativa ainda **não está pronta**: não edite grupos manualmente sem procedimento transacional seguro. É necessária uma operação atômica que remova do grupo anterior, adicione ao novo e atualize `student.group`, com validação e auditoria.
- Os casos completos, cinco etapas com desbloqueio progressivo, relatórios colaborativos, duplas, rubricas, ICA/IPC, gráficos, logs de auditoria e exportação PDF ainda **não foram implementados**.
- O professor pode cadastrar perfis no Firestore, mas **não cria usuários do Firebase Authentication** pelo navegador. Use o console para criar contas.
- Estudantes autenticados e ativos podem consultar os mapas de UID de membros dos grupos para ver vagas; nomes/e-mails não são expostos nessa coleção. Revise a política de privacidade e o aviso LGPD antes de cadastrar pessoas reais.
- Checkpoints são gravações únicas imutáveis, sem correção de texto; o conteúdo dos casos deve ser publicado apenas quando aprovado pelo professor.
- Não testado contra um projeto Firebase real. Execute testes de regras e de ponta a ponta antes de usar com a turma.
