-- MySQL Script generated by MySQL Workbench
-- Sat Feb  2 23:06:50 2019
-- Model: New Model    Version: 1.0
-- MySQL Workbench Forward Engineering

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- -----------------------------------------------------
-- Schema jzsms
-- -----------------------------------------------------

-- -----------------------------------------------------
-- Schema jzsms
-- -----------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `jzsms` DEFAULT CHARACTER SET utf8 ;
USE `jzsms` ;

-- -----------------------------------------------------
-- Table `jzsms`.`accounts`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `jzsms`.`accounts` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `name` VARCHAR(45) NOT NULL COMMENT '用户名',
  `nickname` VARCHAR(100) NULL COMMENT '显示名称',
  `secret` VARCHAR(256) NOT NULL COMMENT '密钥',
  `is_admin` TINYINT NOT NULL DEFAULT 0 COMMENT '是否为系统管理员',
  `is_sms` TINYINT NOT NULL DEFAULT 0 COMMENT '是否允许发短信',
  `is_locked` TINYINT NOT NULL DEFAULT 0 COMMENT '是否锁定',
  PRIMARY KEY (`id`))
ENGINE = InnoDB;

CREATE INDEX `id_accounts_name_secret` ON `jzsms`.`accounts` (`name` ASC, `secret` ASC);

CREATE INDEX `id_accounts_name` ON `jzsms`.`accounts` (`name` ASC);


-- -----------------------------------------------------
-- Table `jzsms`.`account_targets`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `jzsms`.`account_targets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '账号ID',
  `type` VARCHAR(20) NOT NULL COMMENT '聊天软件类型\nqq-QQ群',
  `target` VARCHAR(50) NULL COMMENT '机器人发送目标（例如QQ群）',
  `is_enabled` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`))
ENGINE = InnoDB;

CREATE INDEX `id_account_targets_uid` ON `jzsms`.`account_targets` (`user_id` ASC);


-- -----------------------------------------------------
-- Table `jzsms`.`badwords`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `jzsms`.`badwords` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `pattern` VARCHAR(500) NOT NULL COMMENT '敏感词正则表达式\n',
  `action` VARCHAR(45) NOT NULL COMMENT '匹配敏感词之后的操作\nIgnore-不发送\nreplace-替换词语\nerror-发送报错信息',
  `replace_to` VARCHAR(500) NULL COMMENT '将敏感词替换成的文本（如果action为error则为错误提示）',
  `is_enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用规则',
  `user_id` INT NULL COMMENT '用户id。NULL时为全局。',
  PRIMARY KEY (`id`))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `jzsms`.`contacts`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `jzsms`.`contacts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `mobile_phone` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NULL,
  PRIMARY KEY (`id`))
ENGINE = InnoDB;

CREATE INDEX `id_contacts_uid_phone` ON `jzsms`.`contacts` (`user_id` ASC, `mobile_phone` ASC);

CREATE INDEX `id_contacts_uid_name` ON `jzsms`.`contacts` (`user_id` ASC, `name` ASC);

CREATE INDEX `id_contacts_uid` ON `jzsms`.`contacts` (`user_id` ASC);


-- -----------------------------------------------------
-- Table `jzsms`.`sms_records`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `jzsms`.`sms_records` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `mobile_phone` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NULL,
  `content` TEXT NOT NULL,
  `send_time` DATETIME NOT NULL,
  `is_success` TINYINT NOT NULL,
  `remark` TEXT NULL,
  PRIMARY KEY (`id`))
ENGINE = InnoDB;

CREATE INDEX `id_sms_records_uid` ON `jzsms`.`sms_records` (`user_id` ASC);

CREATE INDEX `id_sms_records_mobile` ON `jzsms`.`sms_records` (`mobile_phone` ASC);


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
