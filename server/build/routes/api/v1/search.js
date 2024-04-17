'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const utils_1 = require('..\\..\\..\\helpers\\utils');
const middlewares_1 = require('..\\..\\..\\middlewares\\index');
const schemas_1 = require('..\\..\\..\\schemas\\index');
const PostSchema_1 = require('..\\..\\..\\schemas\\PostSchema');
const services_1 = require('..\\..\\..\\services\\index');
const express_1 = require('express');
const router = express_1.Router({ mergeParams: true });
router.get('/v1/search', async (req, res, next) => {
    var _a;
    try {
        const {q, type} = req.query;
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 10;
        const skip = offset * limit;
        if (!q)
            return next(new middlewares_1.ErrorHandler(400, 'Search query is required.'));
        let result = [];
        if (type === 'posts') {
            const posts = await services_1.PostService.getPosts(req.user, {
                description: {
                    $regex: q,
                    $options: 'i'
                },
                privacy: PostSchema_1.EPrivacy.public
            }, {
                sort: { createdAt: -1 },
                skip,
                limit
            });
            if (posts.length === 0) {
                return next(new middlewares_1.ErrorHandler(404, 'No posts found.'));
            }
            result = posts;    // console.log(posts);
        } else {
            const users = await schemas_1.User.find({
                $or: [
                    {
                        firstname: {
                            $regex: q,
                            $options: 'i'
                        }
                    },
                    {
                        lastname: {
                            $regex: q,
                            $options: 'i'
                        }
                    },
                    {
                        username: {
                            $regex: q,
                            $options: 'i'
                        }
                    }
                ]
            }).limit(limit).skip(skip);
            if (users.length === 0) {
                return next(new middlewares_1.ErrorHandler(404, 'No users found.'));
            }
            const myFollowingDoc = await schemas_1.Follow.find({ user: (_a = req.user) === null || _a === void 0 ? void 0 : _a._id });
            const myFollowing = myFollowingDoc.map(user => user.target);
            const usersResult = users.map(user => {
                return Object.assign(Object.assign({}, user.toProfileJSON()), { isFollowing: myFollowing.includes(user.id) });
            });
            result = usersResult;
        }
        res.status(200).send(utils_1.makeResponseJson(result));
    } catch (e) {
        console.log('CANT PERFORM SEARCH: ', e);
        next(e);
    }
});
exports.default = router;    //# sourceMappingURL=search.js.map
