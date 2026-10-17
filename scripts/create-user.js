// Uso: npm run user:create -- <usuario> <senha> "<Nome>" [admin|viewer]
import bcrypt from 'bcryptjs';
import { saveUser, findUser } from '../server/store.js';

const [username, password, name, role = 'admin'] = process.argv.slice(2);

if (!username || !password) {
  console.error('Uso: npm run user:create -- <usuario> <senha> "<Nome>" [admin|viewer]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('A senha precisa ter pelo menos 8 caracteres.');
  process.exit(1);
}
if (!['admin', 'viewer'].includes(role)) {
  console.error('Papel inválido. Use admin ou viewer.');
  process.exit(1);
}

const existed = Boolean(findUser(username));
saveUser({
  username,
  name: name || username,
  role,
  passwordHash: bcrypt.hashSync(password, 12),
  createdAt: new Date().toISOString(),
});
console.log(`${existed ? 'Usuário atualizado' : 'Usuário criado'}: ${username} (${role})`);
