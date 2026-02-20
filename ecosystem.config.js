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
        DB_HOST: "database-1.cctawceo4pkq.us-east-1.rds.amazonaws.com",
        DB_USER: "admin",
        DB_PASSWORD: "F3bruary!26",
        DB_NAME: "PhoneShop",
        PORT: 3000
      }
    }
  ]
};
