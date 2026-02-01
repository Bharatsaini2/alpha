"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var pino_1 = require("pino");
var logger = (0, pino_1.default)({
    level: 'info',
    transport: {
        target: 'pino-pretty',
        options: { colorize: true },
    },
});
exports.default = logger;
