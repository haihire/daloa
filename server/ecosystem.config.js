module.exports = {
  apps: [{
    name: 'lomoa-nest',
    script: 'dist/main.js',
    instances: 2,
    exec_mode: 'cluster',
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production' },
    // DATABASE_URL/REDIS_URL 등 민감 변수는 여기 넣지 말 것 — docker-compose env_file로 주입됨
  }],
};
