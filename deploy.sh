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

# Cloudflare Pages 会自动监听 main 分支并进行构建
# 所以我们只需要把源码 push 上去即可

echo -e "\033[0;32m[1/2] Staging changes... \033[0m"
git add .

echo -e "\033[0;32m[2/2] Pushing to GitHub (Triggering Cloudflare Build)... \033[0m"
echo -e "Commit message: $COMMIT_MSG"

git commit -m "$COMMIT_MSG"
git push origin main

echo -e "\033[0;32m🎉 Code pushed! Cloudflare will update your site in a few minutes. \033[0m"
echo -e "\033[0;36m👉 Check status: https://dash.cloudflare.com/ \033[0m"
