"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mongoose_1 = require("mongoose");
var whaleAddressSchema = new mongoose_1.Schema({
    tokenAddress: String,
    tokenDecimals: Number,
    tokenSymbol: String,
    whalesAddress: [String],
    imageUrl: { type: String, default: null },
});
var WhalesAddressModel = (0, mongoose_1.model)('WhalesAddress', whaleAddressSchema);
exports.default = WhalesAddressModel;
