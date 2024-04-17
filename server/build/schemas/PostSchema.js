"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EPrivacy = void 0;
const mongoose_1 = require("mongoose");
var EPrivacy;
(function (EPrivacy) {
    EPrivacy["private"] = "private";
    EPrivacy["public"] = "public";
    EPrivacy["follower"] = "follower";
})(EPrivacy = exports.EPrivacy || (exports.EPrivacy = {}));
const PostSchema = new mongoose_1.Schema({
    _author_id: {
        // author: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    privacy: {
        type: String,
        default: 'public',
        enum: ['private', 'public', 'follower']
    },
    photos: [Object],
    description: {
        type: String,
        default: ''
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    createdAt: Date,
    updatedAt: Date,
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { getters: true, virtuals: true } });
PostSchema.virtual('author', {
    ref: 'User',
    localField: '_author_id',
    foreignField: '_id',
    justOne: true
});
PostSchema.methods.isPostLiked = function (userID) {
    if (!mongoose_1.isValidObjectId(userID))
        return;
    return this.likes.some(user => {
        return user._id.toString() === userID.toString();
    });
};
exports.default = mongoose_1.model('Post', PostSchema);
//# sourceMappingURL=PostSchema.js.map