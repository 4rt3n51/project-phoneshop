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
env_production: {
  DB_HOST: "database-1.cctawceo4pkq.us-east-1.rds.amazonaws.com",
  DB_USER: "admin",
  DB_PASSWORD: "F3bruary!26",
  DB_NAME: "PhoneShop",
  NODE_ENV: "production",
  PORT: 3000
}
