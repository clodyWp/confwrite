# API 接口规范

## 商品接口
- GET /api/products — 商品列表（分页）
- GET /api/products/:id — 商品详情
- POST /api/products — 创建商品
- PUT /api/products/:id — 更新商品

## 订单接口
- POST /api/orders — 创建订单
- GET /api/orders/:id — 订单详情
- POST /api/orders/:id/pay — 支付
- POST /api/orders/:id/refund — 退款

## 用户接口
- POST /api/users/register — 注册
- POST /api/users/login — 登录
- GET /api/users/profile — 个人信息
