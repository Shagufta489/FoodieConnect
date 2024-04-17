'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const constants_1 = require('..\\..\\..\\constants\\constants');
const utils_1 = require('..\\..\\..\\helpers\\utils');
const middlewares_1 = require('..\\..\\..\\middlewares\\index');
const schemas_1 = require('..\\..\\..\\schemas\\index');
const NotificationSchema_1 = require('..\\..\\..\\schemas\\NotificationSchema');
const PostSchema_1 = require('..\\..\\..\\schemas\\PostSchema');
const services_1 = require('..\\..\\..\\services\\index');
const cloudinary_1 = require('..\\..\\..\\storage\\cloudinary');
const validations_1 = require('..\\..\\..\\validations\\validations');
const express_1 = require('express');
const mongoose_1 = require('mongoose');
const router = express_1.Router({ mergeParams: true });
router.post('/v1/post', middlewares_1.isAuthenticated, cloudinary_1.multer.array('photos', 5), validations_1.validateBody(validations_1.schemas.createPostSchema), async (req, res, next) => {
    try {
        const {description, privacy} = req.body;
        let photos = [];
        if (req.files) {
            const photosToSave = req.files.map(file => cloudinary_1.uploadImageToStorage(file, `${ req.user.username }/posts`));
            photos = await Promise.all(photosToSave);
            console.log(photos);
        }
        const post = new schemas_1.Post({
            _author_id: req.user._id,
            // author: req.user._id,
            description: utils_1.filterWords.clean(description),
            photos,
            privacy: privacy || 'public',
            createdAt: Date.now()
        });
        await post.save();
        await post.populate({
            path: 'author',
            select: 'profilePicture username fullname'
        }).execPopulate();
        const myFollowersDoc = await schemas_1.Follow.find({ target: req.user._id });
        // target is yourself
        const myFollowers = myFollowersDoc.map(user => user.user);
        // so user property must be used 
        const newsFeeds = myFollowers.map(follower => ({
            follower: mongoose_1.Types.ObjectId(follower._id),
            post: mongoose_1.Types.ObjectId(post._id),
            post_owner: req.user._id,
            createdAt: post.createdAt
        })).concat({
            follower: req.user._id,
            post_owner: req.user._id,
            post: mongoose_1.Types.ObjectId(post._id),
            createdAt: post.createdAt
        });
        if (newsFeeds.length !== 0) {
            await schemas_1.NewsFeed.insertMany(newsFeeds);
        }
        // Notify followers that new post has been made 
        if (post.privacy !== 'private') {
            const io = req.app.get('io');
            myFollowers.forEach(id => {
                io.to(id.toString()).emit('newFeed', Object.assign(Object.assign({}, post.toObject()), { isOwnPost: false }));
            });
        }
        return res.status(200).send(utils_1.makeResponseJson(Object.assign(Object.assign({}, post.toObject()), { isOwnPost: true })));
    } catch (e) {
        console.log(e);
        next(e);
    }
});
router.get('/v1/:username/posts', middlewares_1.isAuthenticated, async (req, res, next) => {
    try {
        const {username} = req.params;
        const {sortBy, sortOrder} = req.query;
        const user = await schemas_1.User.findOne({ username });
        const myFollowingDoc = await schemas_1.Follow.find({ user: req.user._id });
        const myFollowing = myFollowingDoc.map(user => user.target);
        if (!user)
            return next(new middlewares_1.ErrorHandler(404, 'User not found'));
        const offset = parseInt(req.query.offset) || 0;
        const limit = constants_1.POST_LIMIT;
        const skip = offset * limit;
        const query = {
            _author_id: mongoose_1.Types.ObjectId(user._id),
            privacy: { $in: [PostSchema_1.EPrivacy.public] }
        };
        const sortQuery = { [sortBy || 'createdAt']: sortOrder === 'asc' ? 1 : -1 };
        if (username === req.user.username) {
            // if own profile, get both public,private,follower posts
            query.privacy.$in = [
                PostSchema_1.EPrivacy.public,
                PostSchema_1.EPrivacy.follower,
                PostSchema_1.EPrivacy.private
            ];
        } else if (myFollowing.includes(user._id.toString())) {
            // else get only public posts or follower-only posts
            query.privacy.$in = [
                PostSchema_1.EPrivacy.public,
                PostSchema_1.EPrivacy.follower
            ];
        }
        // run aggregation service
        const agg = await services_1.PostService.getPosts(req.user, query, {
            skip,
            limit,
            sort: sortQuery
        });
        if (agg.length <= 0 && offset === 0) {
            return next(new middlewares_1.ErrorHandler(404, `${ username } hasn't posted anything yet.`));
        } else if (agg.length <= 0 && offset >= 1) {
            return next(new middlewares_1.ErrorHandler(404, 'No more posts.'));
        }
        res.status(200).send(utils_1.makeResponseJson(agg));
    } catch (e) {
        console.log(e);
        next(e);
    }
});
router.post('/v1/like/post/:post_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('post_id'), async (req, res, next) => {
    try {
        const {post_id} = req.params;
        const post = await schemas_1.Post.findById(post_id);
        if (!post)
            return next(new middlewares_1.ErrorHandler(400, 'Post not found.'));
        let state = false;
        // the state whether isLiked = true | false to be sent back to user
        const query = {
            target: mongoose_1.Types.ObjectId(post_id),
            user: req.user._id,
            type: 'Post'
        };
        const likedPost = await schemas_1.Like.findOne(query);
        // Check if already liked post
        if (!likedPost) {
            // If not liked, save new like and notify post owner
            const like = new schemas_1.Like({
                type: 'Post',
                target: post._id,
                user: req.user._id
            });
            await like.save();
            state = true;
            // If not the post owner, send notification to post owner
            if (post._author_id.toString() !== req.user._id.toString()) {
                const io = req.app.get('io');
                const targetUserID = mongoose_1.Types.ObjectId(post._author_id);
                const newNotif = {
                    type: NotificationSchema_1.ENotificationType.like,
                    initiator: req.user._id,
                    target: targetUserID,
                    link: `/post/${ post_id }`
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
        const likesCount = await schemas_1.Like.find({ target: mongoose_1.Types.ObjectId(post_id) });
        res.status(200).send(utils_1.makeResponseJson({
            state,
            likesCount: likesCount.length
        }));
    } catch (e) {
        console.log(e);
        next(e);
    }
});
router.patch('/v1/post/:post_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('post_id'), validations_1.validateBody(validations_1.schemas.createPostSchema), async (req, res, next) => {
    try {
        const {post_id} = req.params;
        const {description, privacy} = req.body;
        const obj = {
            updatedAt: Date.now(),
            isEdited: true
        };
        if (!description && !privacy)
            return next(new middlewares_1.ErrorHandler(400));
        if (description)
            obj.description = utils_1.filterWords.clean(description.trim());
        if (privacy)
            obj.privacy = privacy;
        const post = await schemas_1.Post.findById(post_id);
        if (!post)
            return next(new middlewares_1.ErrorHandler(400));
        if (req.user._id.toString() === post._author_id.toString()) {
            const updatedPost = await schemas_1.Post.findByIdAndUpdate(post_id, { $set: obj }, { new: true });
            await updatedPost.populate({
                path: 'author',
                select: 'fullname username profilePicture'
            }).execPopulate();
            res.status(200).send(utils_1.makeResponseJson(Object.assign(Object.assign({}, updatedPost.toObject()), { isOwnPost: true })));
        } else {
            return next(new middlewares_1.ErrorHandler(401));
        }
    } catch (e) {
        console.log('CANT EDIT POST :', e);
        next(e);
    }
});
// @route /post/:post_id -- DELETE POST
router.delete('/v1/post/:post_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('post_id'), async (req, res, next) => {
    try {
        const {post_id} = req.params;
        const post = await schemas_1.Post.findById(post_id);
        if (!post)
            return next(new middlewares_1.ErrorHandler(400));
        if (req.user._id.toString() === post._author_id.toString()) {
            const imageIDs = post.photos.filter(img => img === null || img === void 0 ? void 0 : img.public_id).map(img => img.public_id);
            if (post.photos && post.photos.length !== 0)
                await cloudinary_1.deleteImageFromStorage(imageIDs);
            await schemas_1.Post.findByIdAndDelete(post_id);
            await schemas_1.Comment.deleteMany({ _post_id: mongoose_1.Types.ObjectId(post_id) });
            await schemas_1.NewsFeed.deleteMany({ post: mongoose_1.Types.ObjectId(post_id) });
            await schemas_1.Bookmark.deleteMany({ _post_id: mongoose_1.Types.ObjectId(post_id) });
            res.sendStatus(200);
        } else {
            return next(new middlewares_1.ErrorHandler(401));
        }
    } catch (e) {
        console.log('CANT DELETE POST', e);
        next(e);
    }
});
router.get('/v1/post/:post_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('post_id'), async (req, res, next) => {
    var _a;
    try {
        const {post_id} = req.params;
        const agg = await services_1.PostService.getPosts(req.user, { _id: mongoose_1.Types.ObjectId(post_id) });
        const post = agg[0] || {};
        if (!post)
            return next(new middlewares_1.ErrorHandler(400, 'Post not found.'));
        if ((post === null || post === void 0 ? void 0 : post.privacy) === 'private' && ((_a = post._author_id) === null || _a === void 0 ? void 0 : _a.toString()) !== req.user._id.toString()) {
            return next(new middlewares_1.ErrorHandler(401));
        }
        res.status(200).send(utils_1.makeResponseJson(post));
    } catch (e) {
        console.log('CANT GET POST', e);
        next(e);
    }
});
router.get('/v1/post/likes/:post_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('post_id'), async (req, res, next) => {
    try {
        const {post_id} = req.params;
        const offset = parseInt(req.query.offset) || 0;
        const limit = constants_1.LIKES_LIMIT;
        const skip = offset * limit;
        const exist = await schemas_1.Post.findById(mongoose_1.Types.ObjectId(post_id));
        if (!exist)
            return next(new middlewares_1.ErrorHandler(400, 'Post not found.'));
        const likers = await schemas_1.Like.find({
            target: mongoose_1.Types.ObjectId(post_id),
            type: 'Post'
        }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate({
            path: 'user',
            select: 'profilePicture username fullname'
        });
        if (likers.length === 0 && offset < 1) {
            return next(new middlewares_1.ErrorHandler(404, 'No likes found.'));
        }
        if (likers.length === 0 && offset > 0) {
            return next(new middlewares_1.ErrorHandler(404, 'No more likes found.'));
        }
        const myFollowingDoc = await schemas_1.Follow.find({ user: req.user._id });
        const myFollowing = myFollowingDoc.map(user => user.target);
        const result = likers.map(like => {
            return Object.assign(Object.assign({}, like.user.toObject()), { isFollowing: myFollowing.includes(like.user.id) });
        });
        res.status(200).send(utils_1.makeResponseJson(result));
    } catch (e) {
        console.log('CANT GET POST LIKERS', e);
        next(e);
    }
});
exports.default = router;    //# sourceMappingURL=post.js.map
