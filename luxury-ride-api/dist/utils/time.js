"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inMinutes = void 0;
const dayjs_1 = __importDefault(require("dayjs"));
const inMinutes = (min) => (0, dayjs_1.default)().add(min, "minute").toDate();
exports.inMinutes = inMinutes;
