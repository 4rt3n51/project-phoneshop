// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'phoneshop',
      script: './server.js',
      cwd: '/opt/phoneshop',        // change to installation path on EC2
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
        // DB credentials should be provided by .env or environment injection (SSM/Secrets Manager)
      }
    }
  ]
};
