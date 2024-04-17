'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const utils_1 = require('..\\..\\..\\helpers\\utils');
const middlewares_1 = require('..\\..\\..\\middlewares\\index');
const schemas_1 = require('..\\..\\..\\schemas\\index');
const cloudinary_1 = require('..\\..\\..\\storage\\cloudinary');
const validations_1 = require('..\\..\\..\\validations\\validations');
const express_1 = require('express');
const router = express_1.Router({ mergeParams: true });
router.get('/v1/:username', middlewares_1.isAuthenticated, async (req, res, next) => {
    try {
        const {username} = req.params;
        const user = await schemas_1.User.findOne({ username });
        if (!user)
            return next(new middlewares_1.ErrorHandler(404, 'User not found.'));
        const myFollowingDoc = await schemas_1.Follow.find({ user: req.user._id });
        const myFollowing = myFollowingDoc.map(user => user.target);
        const agg = await schemas_1.User.aggregate([
            { $match: { _id: user._id } },
            {
                $lookup: {
                    from: 'follows',
                    localField: '_id',
                    foreignField: 'target',
                    as: 'followers'
                }
            },
            {
                $lookup: {
                    from: 'follows',
                    localField: '_id',
                    foreignField: 'user',
                    as: 'following'
                }
            },
            {
                $addFields: {
                    isFollowing: {
                        $in: [
                            '$_id',
                            myFollowing
                        ]
                    },
                    isOwnProfile: {
                        $eq: [
                            '$$CURRENT.username',
                            req.user.username
                        ]
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    id: '$_id',
                    info: 1,
                    isEmailValidated: 1,
                    email: 1,
                    profilePicture: 1,
                    coverPhoto: 1,
                    username: 1,
                    firstname: 1,
                    lastname: 1,
                    dateJoined: 1,
                    followingCount: { $size: '$following' },
                    followersCount: { $size: '$followers' },
                    isFollowing: 1,
                    isOwnProfile: 1
                }
            }
        ]);
        if (agg.length === 0)
            return next(new middlewares_1.ErrorHandler(404, 'User not found.'));
        res.status(200).send(utils_1.makeResponseJson(Object.assign(Object.assign({}, agg[0]), { fullname: user.fullname })));
    } catch (e) {
        console.log(e);
        next(e);
    }
});
router.patch('/v1/:username/edit', middlewares_1.isAuthenticated, validations_1.validateBody(validations_1.schemas.editProfileSchema), async (req, res, next) => {
    try {
        const {username} = req.params;
        const {firstname, lastname, bio, birthday, gender} = req.body;
        const update = { info: {} };
        if (username !== req.user.username)
            return next(new middlewares_1.ErrorHandler(401));
        if (typeof firstname !== 'undefined')
            update.firstname = firstname;
        if (typeof lastname !== 'undefined')
            update.lastname = lastname;
        if (bio)
            update.info.bio = bio;
        if (birthday)
            update.info.birthday = birthday;
        if (gender)
            update.info.gender = gender;
        const newUser = await schemas_1.User.findOneAndUpdate({ username }, { $set: update }, { new: true });
        res.status(200).send(utils_1.makeResponseJson(newUser.toUserJSON()));
    } catch (e) {
        console.log(e);
        next(e);
    }
});
router.post('/v1/upload/:field', middlewares_1.isAuthenticated, cloudinary_1.multer.single('photo'), async (req, res, next) => {
    try {
        const {field} = req.params;
        const file = req.file;
        if (!file)
            return next(new middlewares_1.ErrorHandler(400, 'File not provided.'));
        if (![
                'picture',
                'cover'
            ].includes(field))
            return next(new middlewares_1.ErrorHandler(400, `Unexpected field ${ field }`));
        const image = await cloudinary_1.uploadImageToStorage(file, `${ req.user.username }/profile`);
        const fieldToUpdate = field === 'picture' ? 'profilePicture' : 'coverPhoto';
        await schemas_1.User.findByIdAndUpdate(req.user._id, { $set: { [fieldToUpdate]: image } });
        res.status(200).send(utils_1.makeResponseJson({ image }));
    } catch (e) {
        console.log('CANT UPLOAD FILE: ', e);
        next(e);
    }
});
exports.default = router;    //# sourceMappingURL=user.js.map
