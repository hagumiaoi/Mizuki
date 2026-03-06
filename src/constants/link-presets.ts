import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { LinkPreset, type NavBarLink } from "@/types/config";

export const LinkPresets: { [key in LinkPreset]: NavBarLink } = {
	[LinkPreset.Home]: {
		name: i18n(I18nKey.home),
		url: "/",
		icon: "material-symbols:home",
	},
	[LinkPreset.About]: {
		name: "关于moi",
		url: "/about/",
		icon: "material-symbols:person",
	},
	[LinkPreset.Archive]: {
		name: "小说",
		url: "/novels/",
		icon: "material-symbols:book",
	},
	[LinkPreset.Friends]: {
		name: i18n(I18nKey.friends),
		url: "/friends/",
		icon: "material-symbols:group",
	},
	[LinkPreset.Anime]: {
		name: i18n(I18nKey.anime),
		url: "/anime/",
		icon: "material-symbols:movie",
	},
	[LinkPreset.Diary]: {
		name: i18n(I18nKey.diary),
		url: "/diary/",
		icon: "material-symbols:book",
	},
	[LinkPreset.Essays]: {
		name: "随笔",
		url: "/essays/",
		icon: "material-symbols:edit",
	},
	[LinkPreset.Thoughts]: {
		name: "应统",
		url: "/thoughts/",
		icon: "material-symbols:lightbulb",
	},
	[LinkPreset.Albums]: {
		name: i18n(I18nKey.albums),
		url: "/albums/",
		icon: "material-symbols:photo-library",
	},
	[LinkPreset.Projects]: {
		name: i18n(I18nKey.projects),
		url: "/projects/",
		icon: "material-symbols:work",
	},
	[LinkPreset.Skills]: {
		name: i18n(I18nKey.skills),
		url: "/skills/",
		icon: "material-symbols:psychology",
	},
	[LinkPreset.Timeline]: {
		name: i18n(I18nKey.timeline),
		url: "/timeline/",
		icon: "material-symbols:timeline",
	},
};
