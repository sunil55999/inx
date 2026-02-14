"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const config = {
    development: {
        client: 'postgresql',
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'telegram_signals_marketplace',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
        },
        pool: {
            min: parseInt(process.env.DB_POOL_MIN || '2'),
            max: parseInt(process.env.DB_POOL_MAX || '10'),
        },
        migrations: {
            directory: path_1.default.join(__dirname, 'src', 'database', 'migrations'),
            extension: 'ts',
            tableName: 'knex_migrations',
        },
        seeds: {
            directory: path_1.default.join(__dirname, 'src', 'database', 'seeds'),
            extension: 'ts',
        },
    },
    test: {
        client: 'postgresql',
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'telegram_signals_marketplace_test',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
        },
        pool: {
            min: 1,
            max: 5,
        },
        migrations: {
            directory: path_1.default.join(__dirname, 'src', 'database', 'migrations'),
            extension: 'ts',
            tableName: 'knex_migrations',
        },
    },
    staging: {
        client: 'postgresql',
        connection: {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: { rejectUnauthorized: false },
        },
        pool: {
            min: parseInt(process.env.DB_POOL_MIN || '2'),
            max: parseInt(process.env.DB_POOL_MAX || '10'),
        },
        migrations: {
            directory: path_1.default.join(__dirname, 'src', 'database', 'migrations'),
            extension: 'ts',
            tableName: 'knex_migrations',
        },
    },
    production: {
        client: 'postgresql',
        connection: {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: { rejectUnauthorized: false },
        },
        pool: {
            min: parseInt(process.env.DB_POOL_MIN || '5'),
            max: parseInt(process.env.DB_POOL_MAX || '20'),
        },
        migrations: {
            directory: path_1.default.join(__dirname, 'src', 'database', 'migrations'),
            extension: 'ts',
            tableName: 'knex_migrations',
        },
    },
};
exports.default = config;
//# sourceMappingURL=knexfile.js.map