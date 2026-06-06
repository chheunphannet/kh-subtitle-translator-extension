import {
  BgColorsOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  ScissorOutlined,
  FileTextOutlined,
  FontSizeOutlined,
  CodeOutlined,
  GlobalOutlined,
  BookOutlined,
  FileSearchOutlined,
  EditOutlined,
  SwapOutlined,
  FileSyncOutlined,
  NodeIndexOutlined,
  VideoCameraOutlined,
  FileMarkdownOutlined,
  TranslationOutlined,
  LinkOutlined,
  UnorderedListOutlined,
  ProfileOutlined,
  OrderedListOutlined,
  ToolOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";

interface Project {
  titleKey: string;
  descriptionKey: string;
  key: string;
  icon: React.ReactNode;
  onlyzh?: boolean;
}

const projectCategories = {
  translate: ["json-translate", "subtitle-translator", "md-translator"],
};

export const projects = [
  {
    titleKey: "tools.jsonTranslate.title",
    descriptionKey: "tools.jsonTranslate.description",
    key: "json-translate",
    icon: <TranslationOutlined />,
  },
  {
    titleKey: "tools.subtitleTranslator.title",
    descriptionKey: "tools.subtitleTranslator.description",
    key: "subtitle-translator",
    icon: <VideoCameraOutlined />,
  },
  {
    titleKey: "tools.mdTranslator.title",
    descriptionKey: "tools.mdTranslator.description",
    key: "md-translator",
    icon: <FileMarkdownOutlined />,
  },
];

const projectsMap = projects.reduce((acc: Record<string, Project>, project) => {
  acc[project.key] = project;
  return acc;
}, {});

export const useAppMenu = () => {
  const t = useTranslations();
  const locale = useLocale();

  const createMenuItem = (projectKey: string) => {
    const project = projectsMap[projectKey];
    if (!project || (project.onlyzh && locale !== "zh")) {
      return null;
    }
    const href = project.key === "subtitle-translator"
      ? `/${locale}`
      : `https://tools.newzone.top/${locale}/${project.key}`;

    const isChinese = locale === "zh" || locale === "zh-hant";
    let title: string;
    if (project.key === "json-translate") {
      title = isChinese ? "JSON 翻译" : "JSON Translator";
    } else if (project.key === "md-translator") {
      title = isChinese ? "Markdown 翻译" : "Markdown Translator";
    } else {
      title = t(project.titleKey);
    }

    return {
      label: <Link href={href}>{title}</Link>,
      key: project.key,
      icon: project.icon,
    };
  };

  const generateCategoryItems = (categoryKeys: string[]) => {
    return categoryKeys.map(createMenuItem).filter(Boolean);
  };

  const menuItems = [
    {
      label: <Link href={`/${locale}`}>{t("navigation.home")}</Link>,
      key: "home",
    },
    {
      label: t("navigation.translate"),
      key: "translate",
      icon: <GlobalOutlined />,
      children: generateCategoryItems(projectCategories.translate),
    },
    {
      label: <Link href={`https://tools.newzone.top/${locale}/feedback`}>{t("feedback.feedback1")}</Link>,
      key: "feedback",
    },
  ];

  return menuItems;
};
