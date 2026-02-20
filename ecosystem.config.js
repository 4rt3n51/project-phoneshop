module.exports = {
  apps: [
    {
      name: "phoneshop",
      script: "server.js",
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production",
        DB_HOST: process.env.DB_HOST,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME,
        PORT: process.env.PORT || 3000
      }
    }
  ]
};
