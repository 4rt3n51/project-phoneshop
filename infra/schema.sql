-- infra/schema.sql
CREATE DATABASE IF NOT EXISTS PhoneShop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE PhoneShop;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(255),
  category VARCHAR(255),
  price DECIMAL(10,2) DEFAULT 0,
  stock INT DEFAULT 0,
  colors JSON NULL,
  features JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(128),
  url TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(128),
  k VARCHAR(255),
  v VARCHAR(255),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(128),
  name VARCHAR(255),
  rating INT,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- sample seed
INSERT INTO products (id, name, brand, category, price, stock, colors, features)
VALUES ('s21-ultra', 'Samsung Galaxy S21 Ultra', 'Samsung', 'Phone', 1199.00, 10, JSON_ARRAY('Phantom Black','Phantom Silver'), JSON_ARRAY('5G','NFC'));

INSERT INTO product_images (product_id, url) VALUES ('s21-ultra', 'https://fdn2.gsmarena.com/vv/pics/samsung/samsung-galaxy-s21-ultra-5g-1.jpg');

INSERT INTO product_services (product_id, k, v) VALUES ('s21-ultra', 'Screen replacement', '299');
INSERT INTO product_reviews (product_id, name, rating, comment) VALUES ('s21-ultra', 'Alice', 5, 'Incredible screen');
