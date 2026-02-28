const rewardsService = require('../services/rewardsService');
const { asyncHandler } = require('../middleware/errorHandler');

const getOverview = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const data = await rewardsService.getOverview(userId);
  res.json({ data });
});

const getCatalog = asyncHandler(async (req, res) => {
  const category = req.query.category;
  const rewards = await rewardsService.getCatalog(category);
  res.json({ rewards });
});

const redeem = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { reward_id: rewardId } = req.body;
  if (!rewardId) {
    return res.status(400).json({ error: 'reward_id is required' });
  }
  const result = await rewardsService.redeem(userId, rewardId);
  res.json(result);
});

module.exports = {
  getOverview,
  getCatalog,
  redeem,
};
