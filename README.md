# Sunny Closet · 雪服租赁网站

> 本文档会随里程碑逐步完善。最终版（含部署到 Vercel）将在 M5 完成。

## 技术栈

- Next.js（App Router）+ TypeScript + Tailwind CSS
- Supabase：Postgres 数据库、Auth（管理员登录）、Storage（商品图片）
- zod 表单校验，Vitest 自动化测试

## 目录说明

| 路径 | 作用 |
|---|---|
| `src/app/` | 网站页面 |
| `src/components/` | 页面上复用的组件 |
| `src/config/shop.ts` | 店名、货币、时区、联系方式 |
| `src/messages/zh-CN.ts` | 界面文字（以后加英文从这里扩展） |
| `src/lib/supabase/` | 连接数据库的代码 |
| `supabase/migrations/` | 数据库建表文件（按文件名顺序执行） |
| `supabase/seed.sql` | 演示数据 |
| `tests/` | 自动化测试 |

## 一、本地准备

1. 安装 Node.js LTS（20.9 或更高）：https://nodejs.org
2. 在 Cursor 里打开本项目，菜单 **Terminal → New Terminal** 打开终端，运行：

   ```bash
   npm install
   ```

3. 运行测试，确认环境正常：

   ```bash
   npm test
   ```

## 二、配置 Supabase

### 1. 创建项目

1. 打开 https://supabase.com ，点右上角 **Start your project**，用 GitHub 或邮箱注册并登录。
2. 点 **New project**：
   - **Name**：`sunny-closet`
   - **Database Password**：点 **Generate a password**，然后把密码保存到你自己的密码管理器（本项目日常用不到它，但请妥善保管，不要发给任何人）。
   - **Region**：选离你的顾客最近的，例如 **East US (North Virginia)**。
3. 点 **Create new project**，等待 1–2 分钟直到项目准备好。

### 2. 建表并导入演示数据

左侧菜单点 **SQL Editor**，然后**按顺序**对下面 4 个文件各做一次：点 **New query** → 在 Cursor 里打开文件、全选复制 → 粘贴到 SQL Editor → 点 **Run**，看到 `Success` 再做下一个。

1. `supabase/migrations/20261017000001_schema.sql`
2. `supabase/migrations/20261017000002_security.sql`
3. `supabase/migrations/20261017000003_storage.sql`
4. `supabase/seed.sql`

> 如果 Supabase 提示 “This query has destructive operations”，那是因为文件中有 `revoke`（收回权限）语句，属于正常的安全设置，点 **Run this query** 继续即可。

### 3. 填写密钥

1. 在 Cursor 左侧文件列表中打开项目根目录的 `.env.local`（如果没有，就把 `.env.example` 复制一份并改名为 `.env.local`）。
2. 回到 Supabase，点左上角项目名旁边的 **Connect** 按钮（或 **Project Settings → Data API**），复制 **Project URL**，粘贴到 `NEXT_PUBLIC_SUPABASE_URL=` 后面。
3. 打开 **Project Settings → API Keys**：
   - 复制 **Publishable key**（以 `sb_publishable_` 开头）→ 粘贴到 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` 后面。
   - 在 **Secret keys** 区域点眼睛图标显示并复制（以 `sb_secret_` 开头）→ 粘贴到 `SUPABASE_SECRET_KEY=` 后面。
4. 保存文件。等号前后不要加空格，也不要加引号。

> ⚠️ `.env.local` 已被 `.gitignore` 排除，不会被提交到 git。请不要把里面的内容发到聊天、截图或任何公开的地方。

### 4. 检查配置

在终端运行：

```bash
npm run check:supabase
```

全部显示 ✅ 即表示数据库与密钥都配置正确。

## 三、本地运行

```bash
npm run dev
```

浏览器打开 http://localhost:3000 。按 `Ctrl + C` 停止。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发预览 |
| `npm run build` | 生产构建（部署前检查） |
| `npm test` | 运行全部自动化测试 |
| `npm run check:supabase` | 检查 Supabase 配置 |

## 业务规则速查

- **租期天数** = 归还日 − 取件日 + 1（同一天取还算 1 天）。
- **占用区间** = 取件日 至 归还日，再加上缓冲天数（默认 1 天，可在数据库 `settings` 表中修改）。
  例：10 号取、12 号还、缓冲 1 天 → 13 号清洁，这件最早 14 号可再被取走。
- “待确认 / 已确认 / 已取件 / 已归还” 的订单占用库存；“已拒绝 / 已取消” 释放库存。
- 防超订由数据库的排他约束（`bookings_no_overlap`）保证，并发提交也不会重复分配同一件。
