#!/bin/bash

# 默认提交信息
COMMIT_MSG="Site update: $(date '+%Y-%m-%d %H:%M:%S')"

# 解析命令行参数
while getopts "m:" opt; do
  case $opt in
    m)
      COMMIT_MSG="$OPTARG"
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      exit 1
      ;;
  esac
done

# 1. 部署到 GitHub Pages (网站内容)
echo -e "\033[0;32m[1/4] Cleaning cache... \033[0m"
npx hexo clean

echo -e "\033[0;32m[2/4] Generating static files... \033[0m"
npx hexo generate

echo -e "\033[0;32m[3/4] Deploying to GitHub Pages... \033[0m"
npx hexo deploy

# 2. 备份源码到 GitHub Main 分支 (源码备份)
echo -e "\033[0;32m[4/4] Backing up source code... \033[0m"
echo -e "Commit message: $COMMIT_MSG"

git add .
git commit -m "$COMMIT_MSG"
git push origin main

echo -e "\033[0;32m🎉 All done! Site deployed and source backed up. \033[0m"
