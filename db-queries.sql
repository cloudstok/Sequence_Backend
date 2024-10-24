
DROP DATABASE if EXISTS `sequence_game`;
CREATE DATABASE IF NOT EXISTS `sequence_game`;
use `sequence_game`;



CREATE TABLE `game_templates` (
   `id` int not null auto_increment,
   `data` TEXT NOT NULL,
   `is_active` tinyint NOT NULL DEFAULT '1',
   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
   `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


 CREATE TABLE `game_settings` (
   `id` int not null auto_increment,
   `data` TEXT NOT NULL,
   `is_active` tinyint NOT NULL DEFAULT '1',
   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
   `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

