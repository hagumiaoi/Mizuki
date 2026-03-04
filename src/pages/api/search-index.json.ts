import { getCollection } from "astro:content";
import { getPostUrl, removeFileExtension, url } from "@/utils/url-utils";
import { buildNovelEntryUrlMap } from "@/utils/novel-structure";

type SearchCollection = "posts" | "novels" | "essays" | "thoughts";

type SearchIndexItem = {
	title: string;
	excerpt: string;
	url: string;
	searchText: string;
	publishedAt: number;
	collection: SearchCollection;
};

const MAX_SEARCH_BODY_LENGTH = 5000;

type ContentEntryData = {
	title?: string;
	description?: string;
	tags?: string[];
	author?: string;
	published?: Date;
	draft?: boolean;
};

function normalizeEntryId(id: string) {
	return id.replace(/^\/+|\/+$/g, "");
}

function getIdParts(id: string) {
	return normalizeEntryId(id).split("/").filter(Boolean);
}

function isCollectionCoverEntry(id: string) {
	const parts = getIdParts(id);
	return parts.length === 1 || (parts.length === 2 && parts[0] === parts[1]);
}

function toChapterSlug(value: string) {
	return removeFileExtension(value).replace(/^\d+-/, "");
}

function getCollectionEntryUrl(
	collection: Exclude<SearchCollection, "posts" | "novels">,
	id: string,
) {
	const parts = getIdParts(id);
	const dir = parts[0] || "";

	if (!dir) {
		return url(`/${collection}/`);
	}

	if (isCollectionCoverEntry(id)) {
		return url(`/${collection}/${dir}/`);
	}

	const fileName = toChapterSlug(parts[parts.length - 1]);
	return url(`/${collection}/${dir}/${fileName}/`);
}

function stripMarkdown(content: string) {
	return content
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/[>*_~|#-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function buildExcerpt(description: string, body: string, maxLength = 140) {
	const source = (description || body || "").trim();
	if (!source) {
		return "";
	}
	return source.length > maxLength
		? `${source.slice(0, maxLength)}…`
		: source;
}

function buildSearchText(data: ContentEntryData, body: string) {
	const bodyForSearch = body.slice(0, MAX_SEARCH_BODY_LENGTH);

	return stripMarkdown(
		[
			data.title || "",
			data.description || "",
			Array.isArray(data.tags) ? data.tags.join(" ") : "",
			data.author || "",
			bodyForSearch,
		].join(" "),
	).toLowerCase();
}

async function buildPostsIndex(): Promise<SearchIndexItem[]> {
	const posts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	return posts.map((post) => {
		const data = post.data as ContentEntryData;
		const body = stripMarkdown(post.body || "");

		return {
			title: data.title || post.id,
			excerpt: buildExcerpt(data.description || "", body),
			url: getPostUrl(post),
			searchText: buildSearchText(data, body),
			publishedAt: data.published
				? new Date(data.published).getTime()
				: 0,
			collection: "posts",
		};
	});
}

async function buildCollectionIndex(
	collection: Exclude<SearchCollection, "posts" | "novels">,
): Promise<SearchIndexItem[]> {
	const entries = await getCollection(collection, ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	return entries.map((entry) => {
		const data = entry.data as ContentEntryData;
		const body = stripMarkdown(entry.body || "");

		return {
			title: data.title || getIdParts(entry.id).at(-1) || "",
			excerpt: buildExcerpt(data.description || "", body),
			url: getCollectionEntryUrl(collection, entry.id),
			searchText: buildSearchText(data, body),
			publishedAt: data.published
				? new Date(data.published).getTime()
				: 0,
			collection,
		};
	});
}

async function buildNovelsIndex(): Promise<SearchIndexItem[]> {
	const entries = await getCollection("novels", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const novelUrlMap = buildNovelEntryUrlMap(entries);

	return entries.map((entry) => {
		const data = entry.data as ContentEntryData;
		const body = stripMarkdown(entry.body || "");

		return {
			title: data.title || getIdParts(entry.id).at(-1) || "",
			excerpt: buildExcerpt(data.description || "", body),
			url: novelUrlMap.get(entry.id) || url("/novels/"),
			searchText: buildSearchText(data, body),
			publishedAt: data.published
				? new Date(data.published).getTime()
				: 0,
			collection: "novels",
		};
	});
}

export async function GET() {
	const [posts, novels, essays, thoughts] = await Promise.all([
		buildPostsIndex(),
		buildNovelsIndex(),
		buildCollectionIndex("essays"),
		buildCollectionIndex("thoughts"),
	]);

	const payload = [...posts, ...novels, ...essays, ...thoughts].sort(
		(a, b) => b.publishedAt - a.publishedAt,
	);

	return new Response(JSON.stringify(payload), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=300, s-maxage=300",
		},
	});
}
