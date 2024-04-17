'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const constants_1 = require('..\\..\\..\\constants\\constants');
const utils_1 = require('..\\..\\..\\helpers\\utils');
const middlewares_1 = require('..\\..\\..\\middlewares\\index');
const schemas_1 = require('..\\..\\..\\schemas\\index');
const services_1 = require('..\\..\\..\\services\\index');
const express_1 = require('express');
const mongoose_1 = require('mongoose');
const router = express_1.Router({ mergeParams: true });
router.post('/v1/follow/:follow_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('follow_id'), async (req, res, next) => {
    try {
        const {follow_id} = req.params;
        const user = schemas_1.User.findById(follow_id);
        // CHECK IF FOLLOWING USER EXIST
        if (!user)
            return next(new middlewares_1.ErrorHandler(400, 'The person you\'re trying to follow doesn\'t exist.'));
        // CHECK IF FOLLOWING IS NOT YOURSELF
        if (follow_id === req.user._id.toString())
            return next(new middlewares_1.ErrorHandler(400, 'You can\'t follow yourself.'));
        //  CHECK IF ALREADY FOLLOWING
        const isFollowing = await schemas_1.Follow.findOne({
            user: req.user._id,
            target: mongoose_1.Types.ObjectId(follow_id)
        });
        if (isFollowing) {
            return next(new middlewares_1.ErrorHandler(400, 'Already following.'));
        } else {
            const newFollower = new schemas_1.Follow({
                user: req.user._id,
                target: mongoose_1.Types.ObjectId(follow_id)
            });
            await newFollower.save();
        }
        // TODO ---- FILTER OUT DUPLICATES
        const io = req.app.get('io');
        const notification = new schemas_1.Notification({
            type: 'follow',
            initiator: req.user._id,
            target: mongoose_1.Types.ObjectId(follow_id),
            link: `/user/${ req.user.username }`,
            createdAt: Date.now()
        });
        notification.save().then(async doc => {
            await doc.populate({
                path: 'target initiator',
                select: 'fullname profilePicture username'
            }).execPopulate();
            io.to(follow_id).emit('newNotification', {
                notification: doc,
                count: 1
            });
        });
        // SUBSCRIBE TO USER'S FEED
        const subscribeToUserFeed = await schemas_1.Post.find({ _author_id: mongoose_1.Types.ObjectId(follow_id) }).sort({ createdAt: -1 }).limit(10);
        if (subscribeToUserFeed.length !== 0) {
            const feeds = subscribeToUserFeed.map(post => {
                return {
                    follower: req.user._id,
                    post: post._id,
                    post_owner: post._author_id,
                    createdAt: post.createdAt
                };
            });
            await schemas_1.NewsFeed.insertMany(feeds);
        }
        res.status(200).send(utils_1.makeResponseJson({ state: true }));
    } catch (e) {
        console.log('CANT FOLLOW USER, ', e);
        next(e);
    }
});
router.post('/v1/unfollow/:follow_id', middlewares_1.isAuthenticated, middlewares_1.validateObjectID('follow_id'), async (req, res, next) => {
    try {
        const {follow_id} = req.params;
        const user = schemas_1.User.findById(follow_id);
        if (!user)
            return next(new middlewares_1.ErrorHandler(400, 'The person you\'re trying to unfollow doesn\'t exist.'));
        if (follow_id === req.user._id.toString())
            return next(new middlewares_1.ErrorHandler(400));
        await schemas_1.Follow.deleteOne({
            target: mongoose_1.Types.ObjectId(follow_id),
            user: req.user._id
        });
        // UNSUBSCRIBE TO PERSON'S FEED
        await schemas_1.NewsFeed.deleteMany({
            post_owner: mongoose_1.Types.ObjectId(follow_id),
            follower: req.user._id
        });
        res.status(200).send(utils_1.makeResponseJson({ state: false }));
    } catch (e) {
        console.log('CANT FOLLOW USER, ', e);
        next(e);
    }
});
router.get('/v1/:username/following', middlewares_1.isAuthenticated, async (req, res, next) => {
    try {
        const {username} = req.params;
        const offset = parseInt(req.query.offset) || 0;
        const limit = constants_1.USERS_LIMIT;
        const skip = offset * limit;
        const user = await schemas_1.User.findOne({ username });
        if (!user)
            return next(new middlewares_1.ErrorHandler(404, 'User not found.'));
        const following = await services_1.FollowService.getFollow({ user: user._id }, 'following', req.user, skip, limit);
        if (following.length === 0) {
            return next(new middlewares_1.ErrorHandler(404, `${ username } isn't following anyone.`));
        }
        res.status(200).send(utils_1.makeResponseJson(following));
    } catch (e) {
        next(e);
    }
});
router.get('/v1/:username/followers', middlewares_1.isAuthenticated, async (req, res, next) => {
    try {
        const {username} = req.params;
        const offset = parseInt(req.query.offset) || 0;
        const limit = constants_1.USERS_LIMIT;
        const skip = offset * limit;
        const user = await schemas_1.User.findOne({ username });
        if (!user)
            return next(new middlewares_1.ErrorHandler(404, 'User not found.'));
        const followers = await services_1.FollowService.getFollow({ target: user._id }, 'followers', req.user, skip, limit);
        if (followers.length === 0) {
            return next(new middlewares_1.ErrorHandler(404, `${ username } has no followers.`));
        }
        res.status(200).send(utils_1.makeResponseJson(followers));
    } catch (e) {
        console.log('CANT GET FOLLOWERS', e);
        next(e);
    }
});
router.get('/v1/people/suggested', middlewares_1.isAuthenticated, async (req, res, next) => {
    try {
        const offset = parseInt(req.query.offset) || 0;
        const skipParam = parseInt(req.query.skip) || 0;
        const limit = parseInt(req.query.limit) || constants_1.USERS_LIMIT;
        const skip = skipParam || offset * limit;
        const myFollowingDoc = await schemas_1.Follow.find({ user: req.user._id });
        const myFollowing = myFollowingDoc.map(user => user.target);
        const people = await schemas_1.User.aggregate([
            {
                $match: {
                    _id: {
                        $nin: [
                            ...myFollowing,
                            req.user._id
                        ]
                    }
                }
            },
            ...limit < 10 ? [{ $sample: { size: limit } }] : [],
            { $skip: skip },
            { $limit: limit },
            { $addFields: { isFollowing: false } },
            {
                $project: {
                    _id: 0,
                    id: '$_id',
                    username: '$username',
                    profilePicture: '$profilePicture',
                    isFollowing: 1
                }
            }
        ]);
        if (people.length === 0)
            return next(new middlewares_1.ErrorHandler(404, 'No suggested people.'));
        res.status(200).send(utils_1.makeResponseJson(people));
    } catch (e) {
        console.log('CANT GET SUGGESTED PEOPLE', e);
        next(e);
    }
});
exports.default = router;    //# sourceMappingURL=follow.js.map
