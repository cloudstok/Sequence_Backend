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
   `user_id` varchar(255) DEFAULT NULL,
   `operator_id` varchar(255) DEFAULT NULL,
   `is_active` tinyint NOT NULL DEFAULT '1',
   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
   `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO game_templates (`data`) VALUES ('{"id":1,"gameType":"ONEvONE","gameName":"Two Player","gameSubType":"NLH","winAmount":18,"minPlayer":2,"maxPlayer":2,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":10}'), ('{"id":2,"gameType":"ONEvONE","gameName":"Two Player","gameSubType":"NLH","winAmount":90,"minPlayer":2,"maxPlayer":2,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":50}'), ('{"id":3,"gameType":"ONEvONE","gameName":"Two Player","gameSubType":"NLH","winAmount":180,"minPlayer":2,"maxPlayer":2,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":100}'), ('{"id":4,"gameType":"ONEvONE","gameName":"Two Player","gameSubType":"NLH","winAmount":900,"minPlayer":2,"maxPlayer":2,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":500}'), ('{"id":5,"gameType":"ONEvONE","gameName":"Two Player","gameSubType":"NLH","winAmount":1800,"minPlayer":2,"maxPlayer":2,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":1000}'), ('{"id":6,"gameType":"ONEvONE","gameName":"Two Player","gameSubType":"NLH","winAmount":2700,"minPlayer":2,"maxPlayer":2,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":1500}'), ('{"id":7,"gameType":"ONEvONE","gameName":"Two Player","gameSubType":"NLH","winAmount":3600,"minPlayer":2,"maxPlayer":2,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":2000}'), ('{"id":8,"gameType":"ONEvONE","gameName":"Two Player","gameSubType":"NLH","winAmount":4500,"minPlayer":2,"maxPlayer":2,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":2500}'), ('{"id":9,"gameType":"ONEvONE","gameName":"Two Player","gameSubType":"NLH","winAmount":9000,"minPlayer":2,"maxPlayer":2,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":5000}'), ('{"id":10,"gameType":"ONEvONEvONE","gameName":"Three Player","gameSubType":"NLH","winAmount":27,"minPlayer":3,"maxPlayer":3,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":10}'), ('{"id":11,"gameType":"ONEvONEvONE","gameName":"Three Player","gameSubType":"NLH","winAmount":135,"minPlayer":3,"maxPlayer":3,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":50}'), ('{"id":12,"gameType":"ONEvONEvONE","gameName":"Three Player","gameSubType":"NLH","winAmount":270,"minPlayer":3,"maxPlayer":3,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":100}'), ('{"id":13,"gameType":"ONEvONEvONE","gameName":"Three Player","gameSubType":"NLH","winAmount":1350,"minPlayer":3,"maxPlayer":3,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":500}'), ('{"id":14,"gameType":"ONEvONEvONE","gameName":"Three Player","gameSubType":"NLH","winAmount":2700,"minPlayer":3,"maxPlayer":3,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":1000}'), ('{"id":15,"gameType":"ONEvONEvONE","gameName":"Three Player","gameSubType":"NLH","winAmount":4050,"minPlayer":3,"maxPlayer":3,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":1500}'), ('{"id":16,"gameType":"ONEvONEvONE","gameName":"Three Player","gameSubType":"NLH","winAmount":5400,"minPlayer":3,"maxPlayer":3,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":2000}'), ('{"id":17,"gameType":"ONEvONEvONE","gameName":"Three Player","gameSubType":"NLH","winAmount":6750,"minPlayer":3,"maxPlayer":3,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":2500}'), ('{"id":18,"gameType":"ONEvONEvONE","gameName":"Three Player","gameSubType":"NLH","winAmount":13500,"minPlayer":3,"maxPlayer":3,"createdAt":"2024-01-08T05:36:43.682Z","updatedAt":"2024-01-08T05:36:43.682Z","entryAmount":5000}');

 CREATE TABLE IF NOT EXISTS `settlement`(
   `settlement_id` int NOT NULL AUTO_INCREMENT,
   `bet_id` varchar(255) DEFAULT NULL,
   `lobby_id` varchar(255) DEFAULT NULL,
   `user_id` varchar(255) DEFAULT NULL,
   `operator_id` varchar(255) DEFAULT NULL,
   `name` varchar(60) DEFAULT NULL,
   `bet_amount` decimal(10, 2) DEFAULT 0.00,
   `win_amount` decimal(10, 2) DEFAULT 0.00,
   `status` ENUM('WIN', 'LOSS', 'DRAW') NOT NULL,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`settlement_id`)
 );

 ALTER TABLE `sequence_game`.`settlement` ADD INDEX `inx_bet_id` (`bet_id` ASC) VISIBLE, ADD INDEX `inx_lobby_id` (`lobby_id` ASC) VISIBLE, ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, ADD INDEX `inx_operator_id` (`operator_id` ASC) INVISIBLE, ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE, ADD INDEX `inx_win_amount` (`win_amount` ASC) INVISIBLE, ADD INDEX `inx_status` (`status` ASC) VISIBLE, ADD INDEX `inx_name` (`name` ASC) VISIBLE;

  CREATE TABLE IF NOT EXISTS `game_results`(
   `id` int NOT NULL AUTO_INCREMENT,
   `game_id` INT NOT NULL,
   `room_id` varchar(255) NOT NULL,
   `game_data` LONGTEXT DEFAULT NULL,
   `player_data` TEXT DEFAULT NULL, 
   `bet_amount` decimal(10, 2) DEFAULT 0.00,
   `win_amount` decimal(10, 2) DEFAULT 0.00,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`)
 );

 ALTER TABLE `sequence_game`.`game_results` ADD INDEX `inx_game_id` (`game_id` ASC) INVISIBLE, ADD INDEX `inx_room_id` (`room_id` ASC) INVISIBLE, ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE, ADD INDEX `inx_win_amount` (`win_amount` ASC) VISIBLE;
