'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const constants_1 = require('..\\..\\..\\constants\\constants');
const utils_1 = require('..\\..\\..\\helpers\\utils');
const middlewares_1 = require('..\\..\\..\\middlewares\\index');
const schemas_1 = require('..\\..\\..\\schemas\\index');
const NotificationSchema_1 = require('..\\..\\..\\schemas\\NotificationSchema');
const validations_1 = require('..\\..\\..\\validations\\validations');
const express_1 = require('express');
const mongoose_1 = require('mongoose');
const router = express_1.Router({ mergeParams: true });
router.post('/v1/comment/:post_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('post_id'), validations_1.validateBody(validations_1.schemas.commentSchema), async (req, res, next) => {
    try {
        const {post_id} = req.params;
        const {body} = req.body;
        const userID = req.user._id;
        // check if the POST actually exists
        const post = await schemas_1.Post.findById(post_id);
        if (!post)
            return next(new middlewares_1.ErrorHandler(404, 'Unable to comment. Post not found.'));
        const comment = new schemas_1.Comment({
            _post_id: post_id,
            _author_id: userID,
            body: utils_1.filterWords.clean(body),
            parents: [],
            createdAt: Date.now()
        });
        await comment.save();
        await comment.populate({
            path: 'author',
            select: 'username profilePicture fullname'
        }).execPopulate();
        // SEND NOTIFICATION
        if (post._author_id.toString() !== userID.toString()) {
            const io = req.app.get('io');
            const notification = new schemas_1.Notification({
                type: 'comment',
                initiator: userID,
                target: mongoose_1.Types.ObjectId(post._author_id),
                link: `/post/${ post_id }`,
                createdAt: Date.now()
            });
            notification.save().then(async doc => {
                await doc.populate({
                    path: 'target initiator',
                    select: 'fullname profilePicture username'
                }).execPopulate();
                io.to(post._author_id.toString()).emit('newNotification', {
                    notification: doc,
                    count: 1
                });
            });
        }
        // append the isPostOwner and isOwnComment property
        const result = Object.assign(Object.assign({}, comment.toObject()), {
            isOwnComment: true,
            isPostOwner: post._author_id.toString() === req.user._id.toString()
        });
        res.status(200).send(utils_1.makeResponseJson(result));
    } catch (e) {
        console.log('CAN"T COMMENT', e);
        next(e);
    }
});
router.get('/v1/comment/:post_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('post_id'), async (req, res, next) => {
    var _a;
    try {
        const {post_id} = req.params;
        const skipParams = parseInt(req.query.skip);
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || constants_1.COMMENTS_LIMIT;
        const skip = skipParams || offset * limit;
        const post = await schemas_1.Post.findById(mongoose_1.Types.ObjectId(post_id));
        if (!post)
            return next(new middlewares_1.ErrorHandler(404, 'No post found.'));
        const agg = await schemas_1.Comment.aggregate([
            {
                $match: {
                    _post_id: mongoose_1.Types.ObjectId(post_id),
                    depth: 1
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'users',
                    localField: '_author_id',
                    foreignField: '_id',
                    as: 'author'
                }
            },
            { $unwind: '$author' },
            {
                $project: {
                    author: {
                        username: '$author.username',
                        email: '$author.email',
                        profilePicture: '$author.profilePicture',
                        id: '$author._id'
                    },
                    depth: '$depth',
                    parent: '$parent',
                    body: '$body',
                    isEdited: '$isEdit',
                    post_id: '$_post_id',
                    createdAt: '$createdAt',
                    updatedAt: '$updatedAt'
                }
            },
            {
                $lookup: {
                    from: 'comments',
                    let: { id: '$_id' },
                    pipeline: [{
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: [
                                                '$parent',
                                                '$$id'
                                            ]
                                        },
                                        {
                                            $eq: [
                                                '$depth',
                                                2
                                            ]
                                        }
                                    ]
                                }
                            }
                        }],
                    as: 'replyCount'
                }
            },
            {
                $lookup: {
                    from: 'likes',
                    localField: '_id',
                    foreignField: 'target',
                    as: 'likes'
                }
            },
            {
                $addFields: {
                    likesUserIDs: {
                        $map: {
                            input: '$likes',
                            as: 'commentLike',
                            in: '$$commentLike.user'
                        }
                    }
                }
            },
            {
                $addFields: {
                    isOwnComment: {
                        $eq: [
                            '$author.id',
                            req.user._id
                        ]
                    },
                    isLiked: {
                        $in: [
                            (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
                            '$likesUserIDs'
                        ]
                    },
                    isPostOwner: post._author_id.toString() === req.user._id.toString()
                }    //user.id === comment.author.id || authorID === user.id)
            },
            {
                $project: {
                    _id: 0,
                    id: '$_id',
                    depth: 1,
                    parent: 1,
                    author: 1,
                    isEdited: 1,
                    post_id: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    body: 1,
                    isOwnComment: 1,
                    isPostOwner: 1,
                    isLiked: 1,
                    replyCount: { $size: '$replyCount' },
                    likesCount: { $size: '$likes' }
                }
            }
        ]);
        if (agg.length === 0 && offset < 1) {
            return next(new middlewares_1.ErrorHandler(404, 'No comments found.'));
        }
        if (agg.length === 0 && offset >= 1) {
            return next(new middlewares_1.ErrorHandler(404, 'No more comments.'));
        }
        res.status(200).send(utils_1.makeResponseJson(agg));
    } catch (e) {
        console.log(e);
        next(e);
    }
});
router.delete('/v1/comment/:comment_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('comment_id'), async (req, res, next) => {
    try {
        const {comment_id} = req.params;
        const userID = req.user._id.toString();
        const comment = await schemas_1.Comment.findById(comment_id);
        if (!comment)
            return next(new middlewares_1.ErrorHandler(400, 'Comment not found.'));
        // FIND THE POST TO GET AUTHOR ID
        const post = await schemas_1.Post.findById(comment._post_id);
        const postAuthorID = post._author_id.toString();
        const commentAuthorID = comment._author_id.toString();
        // IF POST OWNER OR COMMENTOR - DELETE COMMENT
        if (userID === commentAuthorID || userID === postAuthorID) {
            // TODO ----------- DELETE ALL COMMENTS/REPLIES/THREAD 
            await schemas_1.Comment.deleteMany({
                $or: [
                    { _id: comment_id },
                    { parents: { $in: [comment_id] } }
                ]
            });
            res.sendStatus(200);
        } else {
            res.sendStatus(401);
        }
    } catch (e) {
        console.log(e);
        next(e);
    }
});
router.patch('/v1/comment/:comment_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('comment_id'), validations_1.validateBody(validations_1.schemas.commentSchema), async (req, res, next) => {
    try {
        const {comment_id} = req.params;
        const {body} = req.body;
        const userID = req.user._id;
        if (!body)
            return res.sendStatus(400);
        const comment = await schemas_1.Comment.findById(comment_id);
        if (!comment)
            return next(new middlewares_1.ErrorHandler(400, 'Comment not found.'));
        const post = await schemas_1.Post.findById(comment._post_id);
        if (!post)
            return next(new middlewares_1.ErrorHandler(400, 'Post not found.'));
        if (userID.toString() === comment._author_id.toString()) {
            const updatedComment = await schemas_1.Comment.findByIdAndUpdate(mongoose_1.Types.ObjectId(comment_id), {
                $set: {
                    body: utils_1.filterWords.clean(body),
                    updatedAt: Date.now(),
                    isEdited: true
                }
            }, { new: true });
            await updatedComment.populate({
                path: 'author',
                select: 'fullname username profilePicture'
            }).execPopulate();
            // append the isPostOwner and isOwnComment property
            const result = Object.assign(Object.assign({}, updatedComment.toObject()), {
                isOwnComment: true,
                isPostOwner: post._author_id.toString() === req.user._id.toString()
            });
            res.status(200).send(utils_1.makeResponseJson(result));
        } else {
            return next(new middlewares_1.ErrorHandler(401));
        }
    } catch (e) {
        next(e);
    }
});
router.post('/v1/reply', middlewares_1.isAuthenticated, validations_1.validateBody(validations_1.schemas.commentSchema), async (req, res, next) => {
    try {
        const {body, comment_id, post_id} = req.body;
        const userID = req.user._id;
        // check if the Comment actually exists
        const comment = await schemas_1.Comment.findById(mongoose_1.Types.ObjectId(comment_id));
        if (!comment)
            return next(new middlewares_1.ErrorHandler(404, 'Unable to reply. Comment not found.'));
        // check if the Post actually exists
        const post = await schemas_1.Post.findById(comment._post_id);
        if (!post)
            return next(new middlewares_1.ErrorHandler(404, 'Unable to reply. Post not found.'));
        const reply = new schemas_1.Comment({
            _post_id: comment._post_id,
            _author_id: userID,
            parent: comment._id,
            parents: [
                ...comment.parents,
                comment
            ],
            depth: comment.depth + 1,
            body: utils_1.filterWords.clean(body),
            createdAt: Date.now()
        });
        await reply.save();
        await reply.populate({
            path: 'author',
            select: 'username profilePicture fullname'
        }).execPopulate();
        // SEND NOTIFICATION
        if (req.user._id.toString() !== comment._author_id.toString()) {
            const io = req.app.get('io');
            const notification = new schemas_1.Notification({
                type: 'reply',
                initiator: userID,
                target: mongoose_1.Types.ObjectId(comment._author_id),
                link: `/post/${ post_id }`,
                createdAt: Date.now()
            });
            notification.save().then(async doc => {
                await doc.populate({
                    path: 'target initiator',
                    select: 'fullname profilePicture username'
                }).execPopulate();
                io.to(comment._author_id.toString()).emit('newNotification', {
                    notification: doc,
                    count: 1
                });
            });
        }
        // append the isPostOwner and isOwnComment property
        const result = Object.assign(Object.assign({}, reply.toObject()), {
            isOwnComment: true,
            isPostOwner: post._author_id.toString() === req.user._id.toString()
        });
        res.status(200).send(utils_1.makeResponseJson(result));
    } catch (e) {
        console.log('CAN"T COMMENT', e);
        next(e);
    }
});
router.get('/v1/reply', middlewares_1.isAuthenticated, async (req, res, next) => {
    var _a;
    try {
        const {comment_id, post_id} = req.query;
        const skipParams = parseInt(req.query.skip);
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || constants_1.COMMENTS_LIMIT;
        const skip = skipParams || offset * limit;
        const reply = await schemas_1.Comment.findById(mongoose_1.Types.ObjectId(comment_id));
        if (!reply)
            return next(new middlewares_1.ErrorHandler(404, 'No reply found.'));
        const post = await schemas_1.Post.findById(mongoose_1.Types.ObjectId(post_id));
        if (!post)
            return next(new middlewares_1.ErrorHandler(404, 'No post found.'));
        const agg = await schemas_1.Comment.aggregate([
            {
                $match: {
                    parent: mongoose_1.Types.ObjectId(comment_id),
                    depth: reply.depth + 1
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $lookup: {
                    from: 'users',
                    localField: '_author_id',
                    foreignField: '_id',
                    as: 'author'
                }
            },
            { $unwind: '$author' },
            {
                $project: {
                    author: {
                        username: '$author.username',
                        email: '$author.email',
                        profilePicture: '$author.profilePicture',
                        id: '$author._id'
                    },
                    depth: '$depth',
                    parent: '$parent',
                    body: '$body',
                    isEdited: '$isEdit',
                    post_id: '$_post_id',
                    createdAt: '$createdAt',
                    updatedAt: '$updatedAt'
                }
            },
            {
                $lookup: {
                    from: 'comments',
                    let: { id: '$_id' },
                    pipeline: [{
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: [
                                                '$parent',
                                                '$$id'
                                            ]
                                        },
                                        {
                                            $eq: [
                                                '$depth',
                                                reply.depth + 2
                                            ]
                                        }
                                    ]
                                }
                            }
                        }],
                    as: 'replyCount'
                }
            },
            {
                $lookup: {
                    from: 'likes',
                    localField: '_id',
                    foreignField: 'target',
                    as: 'likes'
                }
            },
            {
                $addFields: {
                    likesUserIDs: {
                        $map: {
                            input: '$likes',
                            as: 'commentLike',
                            in: '$$commentLike.user'
                        }
                    }
                }
            },
            {
                $addFields: {
                    isOwnComment: {
                        $eq: [
                            '$author.id',
                            req.user._id
                        ]
                    },
                    isLiked: {
                        $in: [
                            (_a = req.user) === null || _a === void 0 ? void 0 : _a._id,
                            '$likesUserIDs'
                        ]
                    },
                    isPostOwner: post._author_id.toString() === req.user._id.toString()
                }    //user.id === comment.author.id || authorID === user.id)
            },
            {
                $project: {
                    _id: 0,
                    id: '$_id',
                    depth: 1,
                    parent: 1,
                    author: 1,
                    isEdited: 1,
                    post_id: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    body: 1,
                    isOwnComment: 1,
                    isPostOwner: 1,
                    isLiked: 1,
                    replyCount: { $size: '$replyCount' },
                    likesCount: { $size: '$likes' }
                }
            }
        ]);
        if (agg.length === 0 && offset < 1) {
            return next(new middlewares_1.ErrorHandler(404, 'No comments found.'));
        }
        if (agg.length === 0 && offset >= 1) {
            return next(new middlewares_1.ErrorHandler(404, 'No more comments.'));
        }
        res.status(200).send(utils_1.makeResponseJson(agg));
    } catch (e) {
        console.log(e);
        next(e);
    }
});
router.post('/v1/like/comment/:comment_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('comment_id'), async (req, res, next) => {
    try {
        const {comment_id} = req.params;
        const comment = await schemas_1.Comment.findById(comment_id);
        if (!comment)
            return next(new middlewares_1.ErrorHandler(400, 'Comment not found.'));
        let state = false;
        // the state whether isLiked = true | false to be sent back to user
        const query = {
            target: mongoose_1.Types.ObjectId(comment_id),
            user: req.user._id,
            type: 'Comment'
        };
        const likedComment = await schemas_1.Like.findOne(query);
        // Check if already liked post
        if (!likedComment) {
            // If not liked, save new like and notify post owner
            const like = new schemas_1.Like({
                type: 'Comment',
                target: comment._id,
                user: req.user._id
            });
            await like.save();
            state = true;
            // If not the post owner, send notification to post owner
            if (comment._author_id.toString() !== req.user._id.toString()) {
                const io = req.app.get('io');
                const targetUserID = mongoose_1.Types.ObjectId(comment._author_id);
                const newNotif = {
                    type: NotificationSchema_1.ENotificationType.commentLike,
                    initiator: req.user._id,
                    target: targetUserID,
                    link: `/post/${ comment._post_id }`
                };
                const notificationExists = await schemas_1.Notification.findOne(newNotif);
                if (!notificationExists) {
                    const notification = new schemas_1.Notification(Object.assign(Object.assign({}, newNotif), { createdAt: Date.now() }));
                    const doc = await notification.save();
                    await doc.populate({
                        path: 'target initiator',
                        select: 'fullname profilePicture username'
                    }).execPopulate();
                    io.to(targetUserID).emit('newNotification', {
                        notification: doc,
                        count: 1
                    });
                } else {
                    await schemas_1.Notification.findOneAndUpdate(newNotif, { $set: { createdAt: Date.now() } });
                }
            }
        } else {
            await schemas_1.Like.findOneAndDelete(query);
            state = false;
        }
        const likesCount = await schemas_1.Like.find({ target: mongoose_1.Types.ObjectId(comment_id) });
        res.status(200).send(utils_1.makeResponseJson({
            state,
            likesCount: likesCount.length
        }));
    } catch (e) {
        console.log(e);
        next(e);
    }
});
exports.default = router;    //# sourceMappingURL=comment.js.map
