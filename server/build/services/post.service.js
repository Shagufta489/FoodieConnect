'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getPosts = void 0;
const schemas_1 = require('..\\schemas\\index');
const buildPaginateOptions = opts => {
    const arr = [];
    if (opts.sort)
        arr.push({ $sort: opts.sort });
    if (opts.skip)
        arr.push({ $skip: opts.skip });
    if (opts.limit)
        arr.push({ $limit: opts.limit });
    return arr;
};
const getPosts = (user, query, paginate) => {
    return new Promise(async (resolve, reject) => {
        try {
            const myBookmarks = await schemas_1.Bookmark.find({ _author_id: user === null || user === void 0 ? void 0 : user._id });
            const bookmarkPostIDs = myBookmarks.map(bm => bm._post_id);
            const agg = await schemas_1.Post.aggregate([
                { $match: query },
                ...buildPaginateOptions(paginate || {}),
                {
                    $lookup: {
                        from: 'comments',
                        localField: '_id',
                        foreignField: '_post_id',
                        as: 'comments'
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
                    $lookup: {
                        from: 'users',
                        let: { authorID: '$_author_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: [
                                            '$_id',
                                            '$$authorID'
                                        ]
                                    }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    id: '$_id',
                                    email: 1,
                                    profilePicture: 1,
                                    username: 1
                                }
                            }
                        ],
                        as: 'author'
                    }
                },
                {
                    $addFields: {
                        likeIDs: {
                            $map: {
                                input: '$likes',
                                as: 'postLike',
                                in: '$$postLike.user'
                            }
                        }
                    }
                },
                {
                    $addFields: {
                        isLiked: {
                            $in: [
                                user === null || user === void 0 ? void 0 : user._id,
                                '$likeIDs'
                            ]
                        },
                        isOwnPost: {
                            $eq: [
                                '$$CURRENT._author_id',
                                user === null || user === void 0 ? void 0 : user._id
                            ]
                        },
                        isBookmarked: {
                            $in: [
                                '$_id',
                                bookmarkPostIDs
                            ]
                        }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        id: '$_id',
                        privacy: 1,
                        photos: 1,
                        description: 1,
                        isEdited: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        author: { $first: '$author' },
                        isLiked: 1,
                        isOwnPost: 1,
                        isBookmarked: 1,
                        commentsCount: { $size: '$comments' },
                        likesCount: { $size: '$likes' }
                    }
                }
            ]);
            resolve(agg);
        } catch (err) {
            reject(err);
        }
    });
};
exports.getPosts = getPosts;    //# sourceMappingURL=post.service.js.map
