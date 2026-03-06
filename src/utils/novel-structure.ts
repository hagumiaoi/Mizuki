import type { CollectionEntry } from "astro:content";
import { removeFileExtension } from "./url-utils";

export type NovelEntry = CollectionEntry<"novels">;

export type NovelWork = {
	categorySlug: string;
	workSlug: string;
	coverEntry: NovelEntry;
	chapterEntries: NovelEntry[];
	isLegacy: boolean;
};

export type NovelCategory = {
	categorySlug: string;
	categoryTitle: string;
	cover: string;
	works: NovelWork[];
};

const NOVEL_CATEGORY_COVER_MAP: Record<string, string> = {
	环世界: "/images/novels/category/rimworld-cover.png",
	兰德大陆: "/images/novels/category/land-cover.png",
	天璀学院: "/images/novels/category/school-cover.png",
};

function resolveNovelCategoryCover(categorySlug: string, works: NovelWork[]) {
	const mappedCover = NOVEL_CATEGORY_COVER_MAP[categorySlug];
	if (mappedCover) {
		return mappedCover;
	}

	return (
		works.find((work) => Boolean(work.coverEntry.data.cover))?.coverEntry
			.data.cover || ""
	);
}

function normalizeEntryId(id: string) {
	return id.replace(/^\/+|\/+$/g, "");
}

export function getNovelIdParts(id: string) {
	return normalizeEntryId(id).split("/").filter(Boolean);
}

function getWorkKey(categorySlug: string, workSlug: string) {
	return `${categorySlug}::${workSlug}`;
}

function hasCoverLikeMetadata(entry: NovelEntry) {
	return Boolean(
		entry.data.cover ||
		entry.data.description ||
		entry.data.author ||
		(entry.data.tags && entry.data.tags.length > 0),
	);
}

function isCoverByParts(
	entry: NovelEntry,
	parts: string[],
	nestedWorkKeys: Set<string>,
) {
	if (parts.length === 1) {
		return true;
	}

	if (parts.length !== 2) {
		return false;
	}

	const [first, second] = parts;
	if (first === second) {
		return true;
	}

	if (nestedWorkKeys.has(getWorkKey(first, second))) {
		return true;
	}

	return hasCoverLikeMetadata(entry);
}

export function getChapterSlugFromEntryId(id: string) {
	const parts = getNovelIdParts(id);
	const lastPart = parts[parts.length - 1] || "";
	return removeFileExtension(lastPart).replace(/^\d+-/, "");
}

function sortByPublishedDesc(a: NovelEntry, b: NovelEntry) {
	const timeA = new Date(a.data.published || 0).getTime();
	const timeB = new Date(b.data.published || 0).getTime();
	return timeB - timeA;
}

function sortChapters(a: NovelEntry, b: NovelEntry) {
	const numberA = a.data.chapterNumber ?? Number.MAX_SAFE_INTEGER;
	const numberB = b.data.chapterNumber ?? Number.MAX_SAFE_INTEGER;
	if (numberA !== numberB) {
		return numberA - numberB;
	}

	const timeA = new Date(a.data.published || 0).getTime();
	const timeB = new Date(b.data.published || 0).getTime();
	if (timeA !== timeB) {
		return timeA - timeB;
	}

	return a.data.title.localeCompare(b.data.title, "zh-Hans-CN");
}

export function buildNovelCategories(entries: NovelEntry[]): NovelCategory[] {
	const entriesWithParts = entries.map((entry) => ({
		entry,
		parts: getNovelIdParts(entry.id),
	}));

	const nestedWorkKeys = new Set(
		entriesWithParts
			.filter(({ parts }) => parts.length >= 3)
			.map(({ parts }) => getWorkKey(parts[0], parts[1])),
	);

	const coverEntries = entriesWithParts.filter(({ entry, parts }) => {
		return isCoverByParts(entry, parts, nestedWorkKeys);
	});

	const works = coverEntries.map(({ entry, parts }) => {
		if (parts.length === 1 || parts[0] === parts[1]) {
			const slug = parts[0];
			return {
				categorySlug: slug,
				workSlug: slug,
				coverEntry: entry,
				chapterEntries: [] as NovelEntry[],
				isLegacy: true,
			};
		}

		return {
			categorySlug: parts[0],
			workSlug: parts[1],
			coverEntry: entry,
			chapterEntries: [] as NovelEntry[],
			isLegacy: false,
		};
	});

	works.sort((a, b) => sortByPublishedDesc(a.coverEntry, b.coverEntry));

	const workMap = new Map<string, NovelWork>();
	for (const work of works) {
		workMap.set(getWorkKey(work.categorySlug, work.workSlug), work);
	}

	for (const { entry, parts } of entriesWithParts) {
		if (parts.length < 2) {
			continue;
		}

		if (isCoverByParts(entry, parts, nestedWorkKeys)) {
			continue;
		}

		let matchedWork: NovelWork | undefined;
		if (parts.length >= 3) {
			matchedWork = workMap.get(getWorkKey(parts[0], parts[1]));
		}

		if (!matchedWork) {
			matchedWork = workMap.get(getWorkKey(parts[0], parts[0]));
		}

		if (!matchedWork && parts.length >= 2) {
			matchedWork = workMap.get(getWorkKey(parts[0], parts[1]));
		}

		if (matchedWork) {
			matchedWork.chapterEntries.push(entry);
		}
	}

	for (const work of works) {
		work.chapterEntries.sort(sortChapters);
	}

	const categoriesMap = new Map<string, NovelCategory>();
	for (const work of works) {
		const existing = categoriesMap.get(work.categorySlug);
		if (existing) {
			existing.works.push(work);
			continue;
		}

		categoriesMap.set(work.categorySlug, {
			categorySlug: work.categorySlug,
			categoryTitle: work.categorySlug,
			cover: "",
			works: [work],
		});
	}

	const categories = Array.from(categoriesMap.values());
	for (const category of categories) {
		category.works.sort((a, b) =>
			sortByPublishedDesc(a.coverEntry, b.coverEntry),
		);
		category.cover = resolveNovelCategoryCover(
			category.categorySlug,
			category.works,
		);
	}

	categories.sort((a, b) => {
		const timeA = new Date(
			a.works[0]?.coverEntry.data.published || 0,
		).getTime();
		const timeB = new Date(
			b.works[0]?.coverEntry.data.published || 0,
		).getTime();
		return timeB - timeA;
	});

	return categories;
}

export function isLegacySingleWorkCategory(category: NovelCategory) {
	return category.works.length === 1 && category.works[0].isLegacy;
}

export function getWorkPath(work: NovelWork) {
	const segments = work.isLegacy
		? [work.categorySlug]
		: [work.categorySlug, work.workSlug];
	return `/novels/${segments.join("/")}/`;
}

export function getChapterPath(work: NovelWork, chapterEntry: NovelEntry) {
	const chapterSlug = getChapterSlugFromEntryId(chapterEntry.id);
	const segments = work.isLegacy
		? [work.categorySlug, chapterSlug]
		: [work.categorySlug, work.workSlug, chapterSlug];
	return `/novels/${segments.join("/")}/`;
}

export function buildNovelEntryUrlMap(entries: NovelEntry[]) {
	const categories = buildNovelCategories(entries);
	const urlMap = new Map<string, string>();

	for (const category of categories) {
		for (const work of category.works) {
			urlMap.set(work.coverEntry.id, getWorkPath(work));
			for (const chapter of work.chapterEntries) {
				urlMap.set(chapter.id, getChapterPath(work, chapter));
			}
		}
	}

	return urlMap;
}
