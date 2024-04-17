'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const constants_1 = require('..\\..\\..\\constants\\constants');
const utils_1 = require('..\\..\\..\\helpers\\utils');
const middlewares_1 = require('..\\..\\..\\middlewares\\index');
const PostSchema_1 = require('..\\..\\..\\schemas\\PostSchema');
const services_1 = require('..\\..\\..\\services\\index');
const express_1 = require('express');
const router = express_1.Router({ mergeParams: true });
router.get('/v1/feed', async (req, res, next) => {
    try {
        const offset = parseInt(req.query.offset, 10) || 0;
        const limit = constants_1.FEED_LIMIT;
        const skip = offset * limit;
        let result = [];
        if (req.isAuthenticated()) {
            result = await services_1.NewsFeedService.getNewsFeed(req.user, { follower: req.user._id }, skip, limit);
        } else {
            result = await services_1.PostService.getPosts(null, { privacy: PostSchema_1.EPrivacy.public }, {
                skip,
                limit,
                sort: { createdAt: -1 }
            });
        }
        if (result.length === 0) {
            return next(new middlewares_1.ErrorHandler(404, 'No more feed.'));
        }
        res.status(200).send(utils_1.makeResponseJson(result));
    } catch (e) {
        console.log('CANT GET FEED', e);
        next(e);
    }
});
exports.default = router;    //# sourceMappingURL=feed.js.map
