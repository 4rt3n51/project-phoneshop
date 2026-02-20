module.exports = {
  apps: [
    {
      name: 'phoneshop',
      script: 'server.js',
      // If you keep env vars in the instance environment, you can omit or set them here:
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
