// Configuração do PM2 no servidor: pm2 startOrReload ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'esteira-de-trafego',
      script: 'server/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '400M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
