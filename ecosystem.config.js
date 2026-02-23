module.exports = {
  apps: [{
    name: 'project-phoneshop',
    script: './src/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000,
      DB_HOST: process.env.DB_HOST || 'localhost',
      DB_USER: process.env.DB_USER || 'user',
      DB_PASS: process.env.DB_PASS || 'pass',
      DB_NAME: process.env.DB_NAME || 'mydatabase',
    },
    instances: 'max',
    exec_mode: 'cluster',
    watch: false,
    log_file: 'logs/combined.outer.log',
    out_file: 'logs/combined.out.log',
    error_file: 'logs/combined.error.log',
    time: true,
  }]
};