<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { navigateToPage } from "@utils/navigation-utils";
import { url } from "@utils/url-utils";
import { onMount, onDestroy } from "svelte";
import type { SearchResult } from "@/global";

type SearchIndexItem = {
	title: string;
	excerpt: string;
	url: string;
	searchText: string;
	publishedAt: number;
	collection: "posts" | "novels" | "essays" | "thoughts";
};

let keywordDesktop = $state("");
let keywordMobile = $state("");
let result: SearchResult[] = $state([]);
let searchIndex: SearchIndexItem[] = $state([]);
let searchIndexLoaded = $state(false);
let searchIndexLoading = $state(false);
let isDesktopSearchExpanded = $state(false);
let debounceTimer: ReturnType<typeof setTimeout>;
let windowJustFocused = false;
let focusTimer: ReturnType<typeof setTimeout>;
let blurTimer: ReturnType<typeof setTimeout>;

const MAX_RESULTS = 20;

const getCurrentKeyword = () => (keywordDesktop || keywordMobile).trim();

const togglePanel = () => {
	const panel = document.getElementById("search-panel");
	panel?.classList.toggle("float-panel-closed");
};

const toggleDesktopSearch = () => {
	// 如果窗口刚获得焦点，不自动展开搜索框
	if (windowJustFocused) {
		return;
	}
	isDesktopSearchExpanded = !isDesktopSearchExpanded;
	if (isDesktopSearchExpanded) {
		setTimeout(() => {
			const input = document.getElementById("search-input-desktop") as HTMLInputElement;
			input?.focus();
		}, 0);
	}
};

const collapseDesktopSearch = () => {
	if (!keywordDesktop) {
		isDesktopSearchExpanded = false;
	}
};

const handleBlur = () => {
	// 延迟处理以允许搜索结果的点击事件先于折叠逻辑执行
	blurTimer = setTimeout(() => {
		isDesktopSearchExpanded = false;
		// 仅隐藏面板并折叠，保留搜索关键词和结果以便下次展开时查看
		setPanelVisibility(false, true);
	}, 200);
};

const setPanelVisibility = (show: boolean, isDesktop: boolean): void => {
	const panel = document.getElementById("search-panel");
	if (!panel || !isDesktop) return;
	if (show) {
		panel.classList.remove("float-panel-closed");
	} else {
		panel.classList.add("float-panel-closed");
	}
};

const closeSearchPanel = (): void => {
	const panel = document.getElementById("search-panel");
	if (panel) {
		panel.classList.add("float-panel-closed");
	}
	// 清空搜索关键词和结果
	keywordDesktop = "";
	keywordMobile = "";
	result = [];
	isDesktopSearchExpanded = false;
};

const handleResultClick = (event: Event, url: string): void => {
	event.preventDefault();
	closeSearchPanel();
	navigateToPage(url);
};

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getSearchTerms = (keyword: string): string[] => {
	const normalized = keyword.trim().toLowerCase();
	if (!normalized) {
		return [];
	}
	return Array.from(new Set(normalized.split(/\s+/).filter(Boolean))).slice(0, 6);
};

const highlightText = (text: string, keyword: string): string => {
	const safeText = escapeHtml(text || "");
	const terms = getSearchTerms(keyword);

	if (!terms.length) {
		return safeText;
	}

	let highlighted = safeText;
	for (const term of terms) {
		const escapedTerm = escapeHtml(term);
		if (!escapedTerm) continue;
		highlighted = highlighted.replace(
			new RegExp(escapeRegExp(escapedTerm), "gi"),
			"<mark>$&</mark>",
		);
	}

	return highlighted;
};

const scoreItem = (item: SearchIndexItem, terms: string[]): number => {
	const title = item.title.toLowerCase();
	const excerpt = item.excerpt.toLowerCase();
	const searchText = item.searchText.toLowerCase();

	let score = 0;
	for (const term of terms) {
		let matched = false;

		if (title.includes(term)) {
			score += 8;
			matched = true;
		}
		if (excerpt.includes(term)) {
			score += 4;
			matched = true;
		}
		if (searchText.includes(term)) {
			score += 2;
			matched = true;
		}

		if (!matched) {
			score -= 1;
		}
	}

	return Math.max(score, 0);
};

const toSearchResult = (item: SearchIndexItem, keyword: string): SearchResult => ({
	url: item.url,
	meta: {
		title: item.title,
	},
	excerpt: highlightText(item.excerpt || item.title, keyword),
});

const search = async (keyword: string, isDesktop: boolean): Promise<void> => {
	const normalizedKeyword = keyword.trim();

	if (!normalizedKeyword) {
		setPanelVisibility(false, isDesktop);
		result = [];
		return;
	}

	if (!searchIndexLoaded) {
		setPanelVisibility(true, isDesktop);
		result = [];
		return;
	}

	const terms = getSearchTerms(normalizedKeyword);
	if (!terms.length) {
		result = [];
		setPanelVisibility(false, isDesktop);
		return;
	}

	try {
		const rankedResults = searchIndex
			.map((item) => ({
				item,
				score: scoreItem(item, terms),
			}))
			.filter((item) => item.score > 0)
			.sort((a, b) => {
				if (b.score !== a.score) {
					return b.score - a.score;
				}
				return (b.item.publishedAt || 0) - (a.item.publishedAt || 0);
			})
			.slice(0, MAX_RESULTS)
			.map(({ item }) => toSearchResult(item, normalizedKeyword));

		result = rankedResults;
		setPanelVisibility(true, isDesktop);
	} catch (error) {
		console.error("Search error:", error);
		result = [];
		setPanelVisibility(true, isDesktop);
	}
};

const loadSearchIndex = async (): Promise<void> => {
	if (searchIndexLoading || searchIndexLoaded) {
		return;
	}

	searchIndexLoading = true;

	try {
		const response = await fetch(url("/api/search-index.json"));
		if (!response.ok) {
			throw new Error(`Failed to load search index: ${response.status}`);
		}

		const payload = await response.json();
		if (Array.isArray(payload)) {
			searchIndex = payload.filter(
				(item): item is SearchIndexItem =>
					typeof item === "object" &&
					item !== null &&
					typeof item.title === "string" &&
					typeof item.excerpt === "string" &&
					typeof item.url === "string" &&
					typeof item.searchText === "string" &&
					typeof item.publishedAt === "number",
			);
		} else {
			searchIndex = [];
		}
	} catch (error) {
		console.error("Failed to load search index:", error);
		searchIndex = [];
	} finally {
		searchIndexLoading = false;
		searchIndexLoaded = true;
	}
};

const handleWindowFocus = () => {
	windowJustFocused = true;
	clearTimeout(focusTimer);
	focusTimer = setTimeout(() => {
		windowJustFocused = false;
	}, 500);
};

onMount(() => {
	void loadSearchIndex();
	window.addEventListener("focus", handleWindowFocus);
});

$effect(() => {
	const keyword = getCurrentKeyword();
	const isDesktop = !!keywordDesktop || isDesktopSearchExpanded;

	clearTimeout(debounceTimer);
	if (keyword) {
		debounceTimer = setTimeout(() => {
			void search(keyword, isDesktop);
		}, 250);
	} else {
		result = [];
		setPanelVisibility(false, isDesktop);
	}
});

$effect(() => {
	if (typeof document !== "undefined") {
		const navbar = document.getElementById("navbar");
		if (isDesktopSearchExpanded) {
			navbar?.classList.add("is-searching");
		} else {
			navbar?.classList.remove("is-searching");
		}
	}
});

onDestroy(() => {
	if (typeof document !== "undefined") {
		const navbar = document.getElementById("navbar");
		navbar?.classList.remove("is-searching");
	}
	window.removeEventListener("focus", handleWindowFocus);
	clearTimeout(debounceTimer);
	clearTimeout(focusTimer);
	clearTimeout(blurTimer);
});
</script>

<!-- search bar for desktop view (collapsed by default) -->
<div class="hidden lg:block relative w-11 h-11 shrink-0">
    <div
        id="search-bar"
        class="flex transition-all items-center h-11 rounded-lg absolute right-0 top-0 shrink-0
            {isDesktopSearchExpanded ? 'bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06] dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10' : 'btn-plain active:scale-90'}
            {isDesktopSearchExpanded ? 'w-48' : 'w-11'}"
        role="button"
        tabindex="0"
        aria-label="Search"
        onmouseenter={() => {if (!isDesktopSearchExpanded) toggleDesktopSearch()}}
        onmouseleave={collapseDesktopSearch}
        onclick={() => {
            const input = document.getElementById("search-input-desktop") as HTMLInputElement;
            input?.focus();
        }}
    >
        <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none {isDesktopSearchExpanded ? 'left-3' : 'left-1/2 -translate-x-1/2'} transition top-1/2 -translate-y-1/2 {isDesktopSearchExpanded ? 'text-black/30 dark:text-white/30' : ''}"></Icon>
        <input id="search-input-desktop" placeholder={i18n(I18nKey.search)} bind:value={keywordDesktop}
            onfocus={() => {
                clearTimeout(blurTimer);
                if (!isDesktopSearchExpanded) toggleDesktopSearch(); 
                search(keywordDesktop, true);
            }}
            onblur={handleBlur}
            class="transition-all pl-10 text-sm bg-transparent outline-0
                h-full {isDesktopSearchExpanded ? 'w-36' : 'w-0'} text-black/50 dark:text-white/50"
        >
    </div>
</div>

<!-- toggle btn for phone/tablet view -->
<button onclick={togglePanel} aria-label="Search Panel" id="search-switch"
        class="btn-plain scale-animation lg:!hidden rounded-lg w-11 h-11 active:scale-90">
    <Icon icon="material-symbols:search" class="text-[1.25rem]"></Icon>
</button>

<!-- search panel -->
<div id="search-panel" class="float-panel float-panel-closed absolute md:w-[30rem] top-20 left-4 md:left-[unset] right-4 z-50 search-panel shadow-2xl rounded-2xl p-2">
    <!-- search bar inside panel for phone/tablet -->
    <div id="search-bar-inside" class="flex relative lg:hidden transition-all items-center h-11 rounded-xl
      bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06]
      dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10
  ">
        <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none ml-3 transition my-auto text-black/30 dark:text-white/30"></Icon>
        <input placeholder={i18n(I18nKey.search)} bind:value={keywordMobile}
               class="pl-10 absolute inset-0 text-sm bg-transparent outline-0
               focus:w-60 text-black/50 dark:text-white/50"
        >
    </div>
    <!-- search results -->
    {#each result as item}
        <a href={item.url}
           onclick={(e) => handleResultClick(e, item.url)}
           class="transition first-of-type:mt-2 lg:first-of-type:mt-0 group block
       rounded-xl text-lg px-3 py-2 hover:bg-[var(--btn-plain-bg-hover)] active:bg-[var(--btn-plain-bg-active)]">
            <div class="transition text-90 inline-flex font-bold group-hover:text-[var(--primary)]">
                {item.meta.title}<Icon icon="fa7-solid:chevron-right" class="transition text-[0.75rem] translate-x-1 my-auto text-[var(--primary)]"></Icon>
            </div>
            <div class="transition text-sm text-50">
                {@html item.excerpt}
            </div>
        </a>
    {/each}

	{#if getCurrentKeyword() && searchIndexLoading}
		<div class="px-3 py-2 text-sm text-black/50 dark:text-white/50">正在加载搜索索引…</div>
	{/if}

	{#if getCurrentKeyword() && searchIndexLoaded && !searchIndexLoading && result.length === 0}
		<div class="px-3 py-2 text-sm text-black/50 dark:text-white/50">未找到相关文章</div>
	{/if}
</div>

<style>
    input:focus {
        outline: 0;
    }
    :global(.search-panel) {
        max-height: calc(100vh - 100px);
        overflow-y: auto;
    }
</style>
