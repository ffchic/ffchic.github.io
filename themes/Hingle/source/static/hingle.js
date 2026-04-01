/* ----

# Hingle Theme
# By: Dreamer-Paul
# Last Update: 2024.9.2

一个简洁大气，含夜间模式的 Hexo 博客模板。

本代码为奇趣保罗原创，并遵守 MIT 开源协议。欢迎访问我的博客：https://paugram.com

---- */

var Paul_Hingle = function (config) {
    var body = document.body;
    var content = ks.select(".post-content:not(.is-special), .page-content:not(.is-special)");

    // 菜单按钮
    this.header = function () {
        var menu = document.getElementsByClassName("head-menu")[0];

        ks.select(".toggle-btn").onclick = function () {
            menu.classList.toggle("active");
        };

        ks.select(".light-btn").onclick = this.night;

        var search = document.getElementsByClassName("search-btn")[0];
        var bar = document.getElementsByClassName("head-search")[0];

        search.addEventListener("click", function () {
            bar.classList.toggle("active");
        })
    };

    // 关灯切换
    this.night = function () {
        if(body.classList.contains("dark-theme")){
            body.classList.remove("dark-theme");
            document.cookie = "night=false;" + "path=/;" + "max-age=21600";
        }
        else{
            body.classList.add("dark-theme");
            document.cookie = "night=true;" + "path=/;" + "max-age=21600";
        }
    };

    // 目录树
    this.tree = function () {
        const wrap = ks.select(".wrap");
        const headings = content.querySelectorAll("h1, h2, h3, h4, h5, h6");

        if (headings.length === 0) {
            return;
        }

        body.classList.add("has-trees");

        // 计算数量，得出最高层级
        const levelCount = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

        headings.forEach((el) => {
            const tagName = el.tagName.toLowerCase();
            levelCount[tagName]++;
        });

        let firstLevel = 1;
        if (levelCount.h1 === 0 && levelCount.h2 > 0) {
            firstLevel = 2;
        }
        else if (levelCount.h1 === 0 && levelCount.h2 === 0 && levelCount.h3 > 0) {
            firstLevel = 3;
        }

        // 目录树节点
        const trees = ks.create("section", {
            class: "article-list",
            html: `<h4><span class="title">目录</span></h4>`
        });

        ks.each(headings, (t, index) => {
            const text = t.innerText;

            t.id = "title-" + index;

            const level = Number(t.tagName.substring(1)) - firstLevel + 1;
            const className = `item-${level}`;

            trees.appendChild(ks.create("a", { class: className, text, href: `#title-${index}` }));
        });

        wrap.appendChild(trees);

        // 绑定元素
        const buttons = ks.select("footer .buttons");
        const btn = ks.create("button", {
            class: "toggle-list",
            attr: [
                {name: "title", value: "切换文章目录"},
            ],
        });
        buttons.appendChild(btn);

        btn.addEventListener("click", () => {
            trees.classList.toggle("active");
        });
    };

    // 自动添加外链
    this.links = function () {
        var l = content.getElementsByTagName("a");

        if(l){
            ks.each(l, function (t) {
                t.target = "_blank";
            });
        }
    };

    this.comment_list = function () {
        ks(".comment-content [href^='#comment']").each(function (t) {
            var item = ks.select(t.getAttribute("href"));

            t.onmouseover = function () {
                item.classList.add("active");
            };

            t.onmouseout = function () {
                item.classList.remove("active");
            };
        });
    };

    // 返回页首
    this.to_top = function () {
        var btn = document.getElementsByClassName("to-top")[0];
        var scroll = document.documentElement.scrollTop || document.body.scrollTop;

        scroll >= window.innerHeight / 2 ? btn.classList.add("active") : btn.classList.remove("active");
    };

    this.header();

    if(content){
        this.tree();
        this.links();
        this.comment_list();
    }

    // 返回页首
    window.addEventListener("scroll", this.to_top);

    // 如果开启自动夜间模式
    if(config.night){
        var hour = new Date().getHours();

        if(document.cookie.indexOf("night") === -1 && (hour <= 5 || hour >= 22)){
            document.body.classList.add("dark-theme");
            document.cookie = "night=true;" + "path=/;" + "max-age=21600";
        }
    }
    else if(document.cookie.indexOf("night") !== -1){
        if(document.cookie.indexOf("night=true") !== -1){
            document.body.classList.add("dark-theme");
        }
        else{
            document.body.classList.remove("dark-theme");
        }
    }

    // 如果开启复制内容提示
    if(config.copyright){
        document.oncopy = function () {
            ks.notice("复制内容请注明来源并保留版权信息！", {color: "yellow", time: 1000})
        };
    }



    //
    // ! Hexo 站内搜索功能
    this.hexo_search = function () {
        var form = ks.select(".head-search"), input = ks.select(".head-search input");
        var resultContainer = ks.select("#local-search-result");
        var isFetched = false;
        var searchData = [];

        input.oninput = function() {
            var keyword = input.value.trim().toLowerCase();
            if (!keyword) {
                resultContainer.innerHTML = "";
                resultContainer.style.display = "none";
                return;
            }

            if (!isFetched) {
                fetch('/search.json')
                    .then(res => res.json())
                    .then(data => {
                        searchData = data;
                        isFetched = true;
                        renderSearch(keyword);
                    })
                    .catch(e => console.error(e));
            } else {
                renderSearch(keyword);
            }
        };

        function renderSearch(keyword) {
            resultContainer.innerHTML = "";
            if (!keyword) {
                resultContainer.style.display = "none";
                return;
            }
            var matchingData = searchData.filter(function(data) {
                var isMatch = false;
                if (data.title && data.title.trim().toLowerCase().indexOf(keyword) >= 0) isMatch = true;
                if (data.content && data.content.trim().toLowerCase().indexOf(keyword) >= 0) isMatch = true;
                return isMatch;
            });

            if (matchingData.length === 0) {
                resultContainer.innerHTML = "<div class='search-empty'>未能找到相关内容</div>";
                resultContainer.style.display = "block";
                return;
            }

            var html = '<ul class="search-result-list">';
            matchingData.forEach(function(data) {
                var itemUrl = data.url || data.path || "";
                if (itemUrl && !itemUrl.startsWith('/')) {
                    itemUrl = '/' + itemUrl;
                }
                html += '<li><a href="' + itemUrl + '" class="search-result-title">' + data.title + '</a></li>';
            });
            html += '</ul>';
            resultContainer.innerHTML = html;
            resultContainer.style.display = "block";
        }

        // 处理点击外部隐藏搜索结果
        document.addEventListener('click', function(e) {
            if (!form.contains(e.target)) {
                resultContainer.style.display = 'none';
            }
        });
        
        // 聚焦时如果已有内容则显示
        input.addEventListener('focus', function() {
            if (input.value.trim().length > 0 && resultContainer.innerHTML !== "") {
                resultContainer.style.display = 'block';
            }
        });

        // 屏蔽回车跳页
        form.onsubmit = function (ev) {
            ev.preventDefault();
        };
    };

    this.hexo_search();
};

// 图片缩放
ks.image(".post-content:not(.is-special) img:not(.no-zoom), .page-content:not(.is-special) img:not(.no-zoom)");

// 请保留版权说明
if(window.console && window.console.log){
    console.log("%c Hingle %c https://paugram.com ","color: #fff; margin: 1em 0; padding: 5px 0; background: #6f9fc7;","margin: 1em 0; padding: 5px 0; background: #efefef;");
}
