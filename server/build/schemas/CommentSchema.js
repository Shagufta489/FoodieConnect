"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const options = {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret, opt) {
            delete ret.parents;
            return ret;
        }
    },
    toObject: {
        getters: true,
        virtuals: true,
        transform: function (doc, ret, opt) {
            delete ret.parents;
            return ret;
        }
    }
};
const CommentSchema = new mongoose_1.Schema({
    _post_id: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Post',
        required: true
    },
    parent: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null
    },
    parents: [{
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Comment'
        }],
    depth: {
        type: Number,
        default: 1
    },
    body: String,
    _author_id: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User'
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    createdAt: Date,
    updatedAt: Date
}, options);
CommentSchema.virtual('author', {
    ref: 'User',
    localField: '_author_id',
    foreignField: '_id',
    justOne: true
});
exports.default = mongoose_1.model('Comment', CommentSchema);
//# sourceMappingURL=CommentSchema.js.map