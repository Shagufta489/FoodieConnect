"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const LikeSchema = new mongoose_1.Schema({
    type: {
        type: String,
        required: true,
        enum: ['Post', 'Comment']
    },
    target: {
        type: mongoose_1.Schema.Types.ObjectId,
        refPath: 'type',
        required: true
    },
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { getters: true, virtuals: true } });
exports.default = mongoose_1.model('Like', LikeSchema);
//# sourceMappingURL=LikeSchema.js.map