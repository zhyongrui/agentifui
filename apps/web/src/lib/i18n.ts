export const supportedLocales = ['zh-CN', 'en-US'] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = 'zh-CN';
export const localeStorageKey = 'agentifui.locale';
export const translationScopes = {
  admin: ['admin.identity', 'admin.audit', 'admin.sources', 'admin.tenants', 'admin.billing'],
  auth: ['auth.login', 'auth.register', 'auth.pending', 'auth.mfa'],
  shared: ['chat.shared', 'chat.artifact_preview'],
  workspace: ['apps.workspace', 'chat.history', 'chat.conversation'],
} as const;

type Messages = {
  language: {
    label: string;
    options: Record<AppLocale, string>;
  };
  mainNav: {
    appsWorkspace: string;
    chatHistory: string;
    profile: string;
    securityMfa: string;
    adminPreview: string;
    ariaLabel: string;
  };
  adminNav: {
    ariaLabel: string;
    identity: string;
    users: string;
    groups: string;
    apps: string;
    billing: string;
    connectors: string;
    sources: string;
    workflows: string;
    audit: string;
    tenants: string;
    eyebrow: string;
  };
  auth: {
    login: {
      eyebrow: string;
      title: string;
      lead: string;
      registered: string;
      activated: string;
      ssoChecking: string;
      ssoAvailablePrefix: string;
      ssoAvailableSuffix: string;
      email: string;
      password: string;
      continue: string;
      continuing: string;
      continueWithPrefix: string;
      redirectingToSso: string;
      noAccountPrefix: string;
      noAccountLink: string;
      loading: string;
      networkError: string;
    };
    register: {
      eyebrow: string;
      title: string;
      lead: string;
      displayName: string;
      displayNamePlaceholder: string;
      email: string;
      password: string;
      emailPlaceholder: string;
      passwordPlaceholder: string;
      submit: string;
      submitting: string;
      networkError: string;
    };
  };
  apps: {
    checkingSession: string;
    loadingWorkspace: string;
    eyebrow: string;
    title: string;
    leadPrefix: string;
    leadSuffix: string;
    authorizedApps: string;
    currentGroup: string;
    snapshotTime: string;
    securityEntry: string;
    workingGroup: string;
    searchApps: string;
    searchPlaceholder: string;
    quotaDegraded: string;
    recentTitle: string;
    recentDescription: string;
    recentEmpty: string;
    favoritesTitle: string;
    favoritesDescription: string;
    favoritesEmpty: string;
    allAppsTitle: string;
    allAppsDescription: string;
    allAppsEmpty: string;
    favorite: string;
    favorited: string;
    openApp: string;
    quotaDegradedAction: string;
    quotaBlockedAction: string;
    unavailableAction: string;
    switchGroupPrefix: string;
    searchTagCost: string;
    quotaSeverityWarning: string;
    quotaSeverityCritical: string;
    quotaSeverityBlocked: string;
    quotaSeverityNormal: string;
    billingWarningTitle: string;
    billingSoftLimit: string;
    billingGrace: string;
    billingHardStop: string;
    billingRemainingPrefix: string;
    billingRemainingSuffix: string;
    billingExportsPrefix: string;
    billingExportsSuffix: string;
    quotaSwitchNoticePrefix: string;
    quotaSwitchNoticeSuffix: string;
    notAuthorized: string;
    launchFromGroupPrefix: string;
    launchFromGroupSuffix: string;
    groupSwitchRequiredPrefix: string;
    quotaExceededPrefix: string;
    quotaExceededSuffix: string;
    quotaDegradedDescription: string;
    workspaceLoadFailed: string;
    reviewInboxTitle: string;
    reviewInboxDescription: string;
    reviewInboxEmpty: string;
    reviewInboxLoading: string;
    reviewInboxUnread: string;
    reviewInboxRead: string;
    reviewInboxOpen: string;
    reviewInboxMarkRead: string;
    reviewInboxMarkingRead: string;
    reviewInboxMentionedBy: string;
    reviewInboxCommentTargetMessage: string;
    reviewInboxCommentTargetRun: string;
    reviewInboxCommentTargetArtifact: string;
    commentMentionHint: string;
  };
  adminBilling: {
    loading: string;
    title: string;
    lead: string;
    totalTenants: string;
    hardStopTenants: string;
    estimatedUsd: string;
    snapshot: string;
    search: string;
    searchPlaceholder: string;
    planName: string;
    status: string;
    monthlyLimit: string;
    softLimitPercent: string;
    graceBuffer: string;
    storageLimit: string;
    monthlyExports: string;
    hardStopEnabled: string;
    featureFlags: string;
    creditsUsed: string;
    remainingCredits: string;
    storageUsage: string;
    exportsUsed: string;
    warnings: string;
    adjustments: string;
    records: string;
    noWarnings: string;
    noAdjustments: string;
    noRecords: string;
    savePlan: string;
    savingPlan: string;
    addAdjustment: string;
    addingAdjustment: string;
    exportJson: string;
    exportCsv: string;
    updateFailed: string;
    adjustmentFailed: string;
    exportFailed: string;
    planSaved: (tenantName: string) => string;
    adjustmentSaved: (tenantName: string, amount: number) => string;
    reason: string;
    reasonPlaceholder: string;
    adjustmentDelta: string;
    adjustmentKind: string;
    creditGrant: string;
    temporaryLimitRaise: string;
    meterCorrection: string;
    enabled: string;
    disabled: string;
    never: string;
  };
  adminApps: {
    loading: string;
    title: string;
    lead: string;
    cleanupCandidates: string;
    coldTimelineSources: string;
    lastCleanupExecution: string;
    noCleanupRecorded: string;
    cleanupBreakdown: (
      archivedConversationCount: number,
      expiredShareCount: number,
      staleSourceCount: number
    ) => string;
    retentionWindow: (timelineRetentionDays: number, staleSourceRetentionDays: number) => string;
    cleanupSummary: (mode: string, archivedConversationCount: number) => string;
    totalApps: string;
    directUserGrants: string;
    denyOverrides: string;
    enabledTools: string;
    snapshot: string;
    costTag: string;
    roleTagPrefix: string;
    launchCount: string;
    lastLaunch: string;
    grantedGroups: string;
    noGroupGrants: string;
    toolRegistry: string;
    toolRegistryLead: string;
    availableTools: string;
    noToolsAssigned: string;
    noToolDescription: string;
    defaultOn: string;
    defaultOff: string;
    tenantOverride: string;
    catalogDefault: string;
    toolTimeoutLabel: string;
    maxAttemptsLabel: string;
    idempotencyScopeLabel: string;
    idempotencyConversation: string;
    idempotencyRun: string;
    toolPolicyDefault: string;
    toolPolicyOverride: string;
    saveTools: string;
    savingTools: string;
    directOverrides: string;
    directOverridesLeadLine1: string;
    directOverridesLeadLine2: string;
    email: string;
    effect: string;
    reason: string;
    reasonPlaceholder: string;
    saveOverride: string;
    savingOverride: string;
    currentOverrides: string;
    noOverrides: string;
    reasonNone: string;
    revoke: string;
    revoking: string;
    savingOverrideFailed: string;
    revokingOverrideFailed: string;
    savingToolsFailed: string;
    cleanupRemovedPrefix: string;
    never: string;
    allow: string;
    deny: string;
    toolRegistrySaved: (appName: string, count: number) => string;
    overrideCreated: (userEmail: string, effect: string, appName: string) => string;
    overrideRevoked: (grantId: string, appName: string) => string;
  };
  adminUsers: {
    loading: string;
    title: string;
    lead: string;
    totalUsers: string;
    mfaEnabled: string;
    pendingReview: string;
    snapshot: string;
    lastLogin: string;
    mfa: string;
    created: string;
    enabled: string;
    disabled: string;
    roles: string;
    noRoles: string;
    groupMemberships: string;
    noMemberships: string;
    primary: string;
    manager: string;
    never: string;
  };
  adminGroups: {
    loading: string;
    title: string;
    lead: string;
    totalGroups: string;
    totalManagers: string;
    totalAppGrants: string;
    snapshot: string;
    members: string;
    managers: string;
    primaryMembers: string;
    grantedApps: string;
    noAppGrants: string;
  };
};

const messages: Record<AppLocale, Messages> = {
  'zh-CN': {
    language: {
      label: '界面语言',
      options: {
        'zh-CN': '简体中文',
        'en-US': 'English',
      },
    },
    mainNav: {
      ariaLabel: '主导航',
      appsWorkspace: '应用工作台',
      chatHistory: '对话历史',
      profile: '个人资料',
      securityMfa: '安全 / MFA',
      adminPreview: '管理预览',
    },
    adminNav: {
      ariaLabel: '管理导航',
      eyebrow: '管理后台',
      identity: '身份与治理',
      users: '用户',
      groups: '群组',
      apps: '应用',
      billing: '计费',
      connectors: '连接器',
      sources: '知识源',
      workflows: '工作流',
      audit: '审计',
      tenants: '租户',
    },
    auth: {
      login: {
        eyebrow: 'S1-1',
        title: '登录',
        lead: '从这里开始实现邮箱密码登录、SSO 域名识别、待审核状态和 MFA。',
        registered: '注册完成，现在可以登录。',
        activated: '邀请已接受，请使用新密码登录。',
        ssoChecking: '正在检查该邮箱是否需要走企业 SSO。',
        ssoAvailablePrefix: '检测到',
        ssoAvailableSuffix: '使用企业 SSO 登录，可跳过密码。',
        email: '邮箱',
        password: '密码',
        continue: '继续',
        continuing: '登录中...',
        continueWithPrefix: '继续使用',
        redirectingToSso: '正在跳转到 SSO...',
        noAccountPrefix: '还没有账号？',
        noAccountLink: '在这里创建',
        loading: '正在加载登录选项...',
        networkError: '暂时无法连接认证网关，请检查服务后重试。',
      },
      register: {
        eyebrow: 'S1-1',
        title: '注册',
        lead: '这里作为租户内注册、邀请激活和密码策略校验的起点。',
        displayName: '显示名称',
        displayNamePlaceholder: '你的名字',
        email: '邮箱',
        password: '密码',
        emailPlaceholder: 'name@company.com',
        passwordPlaceholder: '创建一个高强度密码',
        submit: '创建账号',
        submitting: '创建中...',
        networkError: '暂时无法连接认证网关，请检查服务后重试。',
      },
    },
    apps: {
      checkingSession: '正在检查登录状态...',
      loadingWorkspace: '正在加载应用工作台...',
      eyebrow: 'S1-3 工作台',
      title: '应用工作台',
      leadPrefix: '欢迎回来，',
      leadSuffix:
        '。这里现在由 Gateway 返回真实工作台目录，并持久化收藏、最近使用、默认工作群组和首版 launch handoff。',
      authorizedApps: '个授权应用',
      currentGroup: '当前群组',
      snapshotTime: '目录时间',
      securityEntry: '安全入口',
      workingGroup: '工作群组',
      searchApps: '搜索应用',
      searchPlaceholder: '按名称、描述或标签搜索',
      quotaDegraded:
        '配额服务当前由 Gateway 标记为降级状态。应用目录仍然可浏览，但新启动会被统一暂停，这一行为对齐 `AC-S1-3-B01`。',
      recentTitle: '最近使用',
      recentDescription: '按照最近一次成功进入启动准备态的时间倒序展示。',
      recentEmpty: '还没有最近使用记录。先从下面的应用目录里打开一个应用。',
      favoritesTitle: '收藏',
      favoritesDescription: '收藏常用应用，保持工作台入口稳定。',
      favoritesEmpty: '还没有收藏应用。你可以在任何应用卡片上点击“收藏”。',
      allAppsTitle: '全部应用',
      allAppsDescription: '展示当前账号通过群组授权并集可见的全部应用。',
      allAppsEmpty: '没有匹配的应用，换个关键词试试。',
      favorite: '收藏',
      favorited: '已收藏',
      openApp: '打开应用',
      quotaDegradedAction: '配额服务降级中',
      quotaBlockedAction: '配额不足',
      unavailableAction: '不可用',
      switchGroupPrefix: '切换到',
      searchTagCost: '成本',
      quotaSeverityWarning: '已达到 80% 阈值',
      quotaSeverityCritical: '已达到 90% 阈值',
      quotaSeverityBlocked: '已达到上限',
      quotaSeverityNormal: '额度正常',
      billingWarningTitle: '计费状态',
      billingSoftLimit: '已接近月度额度上限',
      billingGrace: '当前正在消耗宽限额度',
      billingHardStop: '当前租户已触发计费硬停，新启动会被阻止',
      billingRemainingPrefix: '剩余额度',
      billingRemainingSuffix: 'credits',
      billingExportsPrefix: '导出',
      billingExportsSuffix: '次 / 月',
      quotaSwitchNoticePrefix: '工作群组已切换到 ',
      quotaSwitchNoticeSuffix: '，可以重新发起应用启动。',
      notAuthorized: '当前账号没有这个应用的访问授权。',
      launchFromGroupPrefix: '启动后将从 ',
      launchFromGroupSuffix: ' 归因扣减',
      groupSwitchRequiredPrefix: '当前群组无法归因此应用，切换到 ',
      quotaExceededPrefix: '本次启动会超过 ',
      quotaExceededSuffix: '，因此被拦截。',
      quotaDegradedDescription: '当前处于配额服务降级模式，目录可查看，但新启动会被暂停。',
      workspaceLoadFailed: '应用工作台加载失败，请稍后重试。',
      reviewInboxTitle: '协作提醒',
      reviewInboxDescription: '这里会显示评论中通过 @邮箱 提及你的协作提醒。',
      reviewInboxEmpty: '目前没有新的协作提醒。',
      reviewInboxLoading: '正在同步协作提醒...',
      reviewInboxUnread: '未读',
      reviewInboxRead: '已读',
      reviewInboxOpen: '打开对话',
      reviewInboxMarkRead: '标记已读',
      reviewInboxMarkingRead: '处理中...',
      reviewInboxMentionedBy: '提及人',
      reviewInboxCommentTargetMessage: '消息评论',
      reviewInboxCommentTargetRun: '运行评论',
      reviewInboxCommentTargetArtifact: '产物评论',
      commentMentionHint: '可用 @邮箱 提及已共享访问该会话的协作者。',
    },
    adminBilling: {
      loading: '正在加载计费视图...',
      title: '计费',
      lead: '按租户查看 launch、completion、retrieval、storage 和 export 的计费汇总，并调整计划与临时额度。',
      totalTenants: '租户数',
      hardStopTenants: '硬停租户',
      estimatedUsd: '预估美元',
      snapshot: '快照时间',
      search: '搜索',
      searchPlaceholder: '按租户名称搜索',
      planName: '计划',
      status: '状态',
      monthlyLimit: '月度额度',
      softLimitPercent: '软阈值',
      graceBuffer: '宽限额度',
      storageLimit: '存储上限',
      monthlyExports: '月导出上限',
      hardStopEnabled: '硬停',
      featureFlags: '功能标记',
      creditsUsed: '已用额度',
      remainingCredits: '剩余额度',
      storageUsage: '存储使用',
      exportsUsed: '导出使用',
      warnings: '警告',
      adjustments: '调整',
      records: '记录',
      noWarnings: '暂无计费警告',
      noAdjustments: '暂无调整记录',
      noRecords: '暂无计费记录',
      savePlan: '保存计划',
      savingPlan: '保存中...',
      addAdjustment: '添加调整',
      addingAdjustment: '添加中...',
      exportJson: '导出 JSON',
      exportCsv: '导出 CSV',
      updateFailed: '保存计费计划失败，请重试。',
      adjustmentFailed: '添加计费调整失败，请重试。',
      exportFailed: '导出计费数据失败，请重试。',
      planSaved: tenantName => `${tenantName} 的计费计划已更新。`,
      adjustmentSaved: (tenantName, amount) => `${tenantName} 已添加 ${amount} credits 调整。`,
      reason: '原因',
      reasonPlaceholder: '可选：说明本次调整原因',
      adjustmentDelta: '调整额度',
      adjustmentKind: '调整类型',
      creditGrant: '赠送额度',
      temporaryLimitRaise: '临时提额',
      meterCorrection: '计量修正',
      enabled: '开启',
      disabled: '关闭',
      never: '从未',
    },
    adminApps: {
      loading: '正在加载管理端应用...',
      title: '应用',
      lead: '在群组、角色和直接用户允许/拒绝覆盖范围内管理应用可见性。',
      cleanupCandidates: '清理候选',
      coldTimelineSources: '冷时间线 / 陈旧知识源',
      lastCleanupExecution: '最近一次清理执行',
      noCleanupRecorded: '暂时还没有记录到清理执行。',
      cleanupBreakdown: (archivedConversationCount, expiredShareCount, staleSourceCount) =>
        `${archivedConversationCount} 个归档对话 · ${expiredShareCount} 个过期分享 · ${staleSourceCount} 个陈旧知识源`,
      retentionWindow: (timelineRetentionDays, staleSourceRetentionDays) =>
        `时间线保留 ${timelineRetentionDays} 天 · 知识源保留 ${staleSourceRetentionDays} 天`,
      cleanupSummary: (mode, archivedConversationCount) =>
        `${mode} · 已删除 ${archivedConversationCount} 个归档对话`,
      totalApps: '应用总数',
      directUserGrants: '直接用户授权',
      denyOverrides: '拒绝覆盖',
      enabledTools: '已启用工具',
      snapshot: '快照时间',
      costTag: '成本',
      roleTagPrefix: '角色',
      launchCount: '启动次数',
      lastLaunch: '最近启动',
      grantedGroups: '已授权群组',
      noGroupGrants: '没有群组授权',
      toolRegistry: '工具注册表',
      toolRegistryLead: '配置当前租户向应用运行时暴露的结构化工具。',
      availableTools: '可用工具',
      noToolsAssigned: '没有分配工具',
      noToolDescription: '暂无描述。',
      defaultOn: '默认开启',
      defaultOff: '默认关闭',
      tenantOverride: '租户覆盖',
      catalogDefault: '目录默认值',
      toolTimeoutLabel: '超时',
      maxAttemptsLabel: '最大尝试次数',
      idempotencyScopeLabel: '幂等范围',
      idempotencyConversation: '会话级',
      idempotencyRun: '运行级',
      toolPolicyDefault: '执行策略使用目录默认值',
      toolPolicyOverride: '执行策略已被租户覆盖',
      saveTools: '保存工具注册表',
      savingTools: '正在保存工具...',
      directOverrides: '直接用户覆盖',
      directOverridesLeadLine1: '按邮箱添加用户级允许或拒绝授权。',
      directOverridesLeadLine2: '这会直接写入持久化的 workspace grant 表。',
      email: '邮箱',
      effect: '效果',
      reason: '原因',
      reasonPlaceholder: '可选：补充覆盖背景',
      saveOverride: '保存直接覆盖',
      savingOverride: '正在保存覆盖...',
      currentOverrides: '当前覆盖',
      noOverrides: '没有直接用户覆盖',
      reasonNone: '无',
      revoke: '撤销',
      revoking: '撤销中...',
      savingOverrideFailed: '保存直接覆盖失败，请重试。',
      revokingOverrideFailed: '撤销直接覆盖失败，请重试。',
      savingToolsFailed: '保存工具注册表变更失败，请重试。',
      cleanupRemovedPrefix: '已删除',
      never: '从未',
      allow: '允许',
      deny: '拒绝',
      toolRegistrySaved: (appName, count) => `${appName} 当前在这个租户中暴露 ${count} 个启用工具。`,
      overrideCreated: (userEmail, effect, appName) =>
        `${userEmail} 现在对 ${appName} 拥有一条 ${effect === 'allow' ? '允许' : '拒绝'} 覆盖。`,
      overrideRevoked: (grantId, appName) => `已从 ${appName} 撤销直接覆盖 ${grantId}。`,
    },
    adminUsers: {
      loading: '正在加载管理端用户...',
      title: '用户',
      lead: '只读查看租户用户清单、状态、MFA、角色和持久化群组成员关系。',
      totalUsers: '用户总数',
      mfaEnabled: '已启用 MFA',
      pendingReview: '待审核',
      snapshot: '快照时间',
      lastLogin: '最近登录',
      mfa: 'MFA',
      created: '创建时间',
      enabled: '已启用',
      disabled: '未启用',
      roles: '角色',
      noRoles: '没有持久化角色',
      groupMemberships: '群组成员关系',
      noMemberships: '没有持久化成员关系',
      primary: '主群组',
      manager: '管理员',
      never: '从未',
    },
    adminGroups: {
      loading: '正在加载管理端群组...',
      title: '群组',
      lead: '在开放写操作前，先查看持久化群组成员规模、管理员覆盖率和应用授权情况。',
      totalGroups: '群组总数',
      totalManagers: '管理员总数',
      totalAppGrants: '应用授权总数',
      snapshot: '快照时间',
      members: '成员数',
      managers: '管理员数',
      primaryMembers: '主成员数',
      grantedApps: '已授权应用',
      noAppGrants: '没有应用授权',
    },
  },
  'en-US': {
    language: {
      label: 'Interface language',
      options: {
        'zh-CN': '简体中文',
        'en-US': 'English',
      },
    },
    mainNav: {
      ariaLabel: 'Main sections',
      appsWorkspace: 'Apps workspace',
      chatHistory: 'Chat history',
      profile: 'Profile',
      securityMfa: 'Security / MFA',
      adminPreview: 'Admin preview',
    },
    adminNav: {
      ariaLabel: 'Admin sections',
      eyebrow: 'Admin',
      identity: 'Identity',
      users: 'Users',
      groups: 'Groups',
      apps: 'Apps',
      billing: 'Billing',
      connectors: 'Connectors',
      sources: 'Sources',
      workflows: 'Workflows',
      audit: 'Audit',
      tenants: 'Tenants',
    },
    auth: {
      login: {
        eyebrow: 'S1-1',
        title: 'Login',
        lead: 'Start email/password login, SSO domain discovery, pending review, and MFA here.',
        registered: 'Registration complete. You can now sign in.',
        activated: 'Invitation accepted. Sign in with your new password.',
        ssoChecking: 'Checking whether this email should use enterprise SSO.',
        ssoAvailablePrefix: 'Enterprise SSO detected for',
        ssoAvailableSuffix: '. Continue without a password.',
        email: 'Email',
        password: 'Password',
        continue: 'Continue',
        continuing: 'Signing in...',
        continueWithPrefix: 'Continue with',
        redirectingToSso: 'Redirecting to SSO...',
        noAccountPrefix: 'No account yet?',
        noAccountLink: 'Create one here',
        loading: 'Loading sign-in options...',
        networkError: 'Unable to reach the auth gateway. Check the gateway server and try again.',
      },
      register: {
        eyebrow: 'S1-1',
        title: 'Register',
        lead: 'Use this as the entry point for tenant sign-up, invitation activation, and password policy checks.',
        displayName: 'Display name',
        displayNamePlaceholder: 'Your name',
        email: 'Email',
        password: 'Password',
        emailPlaceholder: 'name@company.com',
        passwordPlaceholder: 'Create a strong password',
        submit: 'Create account',
        submitting: 'Creating account...',
        networkError: 'Unable to reach the auth gateway. Check the gateway server and try again.',
      },
    },
    apps: {
      checkingSession: 'Checking your session...',
      loadingWorkspace: 'Loading apps workspace...',
      eyebrow: 'S1-3 Workspace',
      title: 'Apps workspace',
      leadPrefix: 'Welcome back, ',
      leadSuffix:
        '. The Gateway now returns a real workspace catalog here and persists favorites, recents, the default working group, and the first launch handoff.',
      authorizedApps: 'authorized apps',
      currentGroup: 'Current group',
      snapshotTime: 'Catalog snapshot',
      securityEntry: 'Security entry',
      workingGroup: 'Working group',
      searchApps: 'Search apps',
      searchPlaceholder: 'Search by name, description, or tag',
      quotaDegraded:
        'The quota service is currently marked degraded by the Gateway. You can still browse the catalog, but new launches stay paused to match `AC-S1-3-B01`.',
      recentTitle: 'Recent',
      recentDescription: 'Ordered by the most recent successful handoff-ready launch.',
      recentEmpty: 'No recent launches yet. Open an app from the catalog below first.',
      favoritesTitle: 'Favorites',
      favoritesDescription: 'Pin your common apps to keep the workspace entry stable.',
      favoritesEmpty: 'No favorite apps yet. Use “Favorite” on any app card.',
      allAppsTitle: 'All apps',
      allAppsDescription: 'Shows every app visible through your current group authorization union.',
      allAppsEmpty: 'No apps matched. Try a different search term.',
      favorite: 'Favorite',
      favorited: 'Favorited',
      openApp: 'Open app',
      quotaDegradedAction: 'Quota degraded',
      quotaBlockedAction: 'Quota exceeded',
      unavailableAction: 'Unavailable',
      switchGroupPrefix: 'Switch to',
      searchTagCost: 'Cost',
      quotaSeverityWarning: '80% threshold reached',
      quotaSeverityCritical: '90% threshold reached',
      quotaSeverityBlocked: 'Limit reached',
      quotaSeverityNormal: 'Within range',
      billingWarningTitle: 'Billing status',
      billingSoftLimit: 'Monthly credit usage is near the soft limit.',
      billingGrace: 'This tenant is currently consuming grace credits.',
      billingHardStop: 'Billing hard stop is active. New launches remain blocked.',
      billingRemainingPrefix: 'Remaining',
      billingRemainingSuffix: 'credits',
      billingExportsPrefix: 'Exports',
      billingExportsSuffix: 'per month',
      quotaSwitchNoticePrefix: 'Working group switched to ',
      quotaSwitchNoticeSuffix: '. You can retry the app launch now.',
      notAuthorized: 'This account is not authorized to access the app.',
      launchFromGroupPrefix: 'Launching will attribute ',
      launchFromGroupSuffix: ' credits to ',
      groupSwitchRequiredPrefix: 'This group cannot attribute the app. Switch to ',
      quotaExceededPrefix: 'This launch would exceed ',
      quotaExceededSuffix: ', so it is blocked.',
      quotaDegradedDescription:
        'The quota service is degraded. The catalog remains readable, but new launches stay paused.',
      workspaceLoadFailed: 'Apps workspace failed to load. Please retry later.',
      reviewInboxTitle: 'Review inbox',
      reviewInboxDescription:
        'Comment mentions addressed to you appear here. Use @email syntax in workspace comments.',
      reviewInboxEmpty: 'No collaboration reminders yet.',
      reviewInboxLoading: 'Syncing collaboration notifications...',
      reviewInboxUnread: 'Unread',
      reviewInboxRead: 'Read',
      reviewInboxOpen: 'Open conversation',
      reviewInboxMarkRead: 'Mark as read',
      reviewInboxMarkingRead: 'Updating...',
      reviewInboxMentionedBy: 'Mentioned by',
      reviewInboxCommentTargetMessage: 'Message comment',
      reviewInboxCommentTargetRun: 'Run comment',
      reviewInboxCommentTargetArtifact: 'Artifact comment',
      commentMentionHint:
        'Use @email to mention collaborators who already have access to the shared conversation.',
    },
    adminBilling: {
      loading: 'Loading billing overview...',
      title: 'Billing',
      lead: 'Review tenant billing for launches, completions, retrieval, storage, and exports, then adjust plans and temporary credits.',
      totalTenants: 'Tenants',
      hardStopTenants: 'Hard-stop tenants',
      estimatedUsd: 'Estimated USD',
      snapshot: 'Snapshot',
      search: 'Search',
      searchPlaceholder: 'Search by tenant name',
      planName: 'Plan',
      status: 'Status',
      monthlyLimit: 'Monthly credits',
      softLimitPercent: 'Soft limit',
      graceBuffer: 'Grace buffer',
      storageLimit: 'Storage limit',
      monthlyExports: 'Monthly exports',
      hardStopEnabled: 'Hard stop',
      featureFlags: 'Feature flags',
      creditsUsed: 'Credits used',
      remainingCredits: 'Remaining credits',
      storageUsage: 'Storage usage',
      exportsUsed: 'Export usage',
      warnings: 'Warnings',
      adjustments: 'Adjustments',
      records: 'Records',
      noWarnings: 'No billing warnings.',
      noAdjustments: 'No billing adjustments recorded.',
      noRecords: 'No billing records available.',
      savePlan: 'Save plan',
      savingPlan: 'Saving...',
      addAdjustment: 'Add adjustment',
      addingAdjustment: 'Adding...',
      exportJson: 'Export JSON',
      exportCsv: 'Export CSV',
      updateFailed: 'Saving the billing plan failed. Please retry.',
      adjustmentFailed: 'Saving the billing adjustment failed. Please retry.',
      exportFailed: 'Exporting billing data failed. Please retry.',
      planSaved: tenantName => `${tenantName} billing plan updated.`,
      adjustmentSaved: (tenantName, amount) => `${tenantName} received a ${amount} credit adjustment.`,
      reason: 'Reason',
      reasonPlaceholder: 'Optional context for this adjustment',
      adjustmentDelta: 'Credit delta',
      adjustmentKind: 'Adjustment kind',
      creditGrant: 'Credit grant',
      temporaryLimitRaise: 'Temporary limit raise',
      meterCorrection: 'Meter correction',
      enabled: 'Enabled',
      disabled: 'Disabled',
      never: 'Never',
    },
    adminApps: {
      loading: 'Loading admin apps...',
      title: 'Apps',
      lead: 'Manage app visibility across groups, roles, and direct user allow or deny overrides.',
      cleanupCandidates: 'Cleanup candidates',
      coldTimelineSources: 'Cold timeline / stale sources',
      lastCleanupExecution: 'Last cleanup execution',
      noCleanupRecorded: 'No cleanup execution has been recorded yet.',
      cleanupBreakdown: (archivedConversationCount, expiredShareCount, staleSourceCount) =>
        `${archivedConversationCount} archived conversations · ${expiredShareCount} expired shares · ${staleSourceCount} stale sources`,
      retentionWindow: (timelineRetentionDays, staleSourceRetentionDays) =>
        `Timeline ${timelineRetentionDays} days · Sources ${staleSourceRetentionDays} days`,
      cleanupSummary: (mode, archivedConversationCount) =>
        `${mode} · removed ${archivedConversationCount} archived conversations`,
      totalApps: 'Total apps',
      directUserGrants: 'Direct user grants',
      denyOverrides: 'Deny overrides',
      enabledTools: 'Enabled tools',
      snapshot: 'Snapshot',
      costTag: 'Cost',
      roleTagPrefix: 'role',
      launchCount: 'Launch count',
      lastLaunch: 'Last launch',
      grantedGroups: 'Granted groups',
      noGroupGrants: 'No group grants',
      toolRegistry: 'Tool registry',
      toolRegistryLead: 'Configure which structured tools this tenant exposes to the app runtime.',
      availableTools: 'Available tools',
      noToolsAssigned: 'No tools assigned',
      noToolDescription: 'No description provided.',
      defaultOn: 'default on',
      defaultOff: 'default off',
      tenantOverride: 'tenant override',
      catalogDefault: 'catalog default',
      toolTimeoutLabel: 'Timeout',
      maxAttemptsLabel: 'Max attempts',
      idempotencyScopeLabel: 'Idempotency scope',
      idempotencyConversation: 'conversation',
      idempotencyRun: 'run',
      toolPolicyDefault: 'execution policy uses the catalog default',
      toolPolicyOverride: 'execution policy is overridden for this tenant',
      saveTools: 'Save tool registry',
      savingTools: 'Saving tools...',
      directOverrides: 'Direct user overrides',
      directOverridesLeadLine1: 'Add a user-level allow or deny grant by email.',
      directOverridesLeadLine2: 'This writes directly into the persisted workspace grant table.',
      email: 'Email',
      effect: 'Effect',
      reason: 'Reason',
      reasonPlaceholder: 'Optional context for the override',
      saveOverride: 'Save direct override',
      savingOverride: 'Saving override...',
      currentOverrides: 'Current overrides',
      noOverrides: 'No direct user overrides',
      reasonNone: 'none',
      revoke: 'Revoke',
      revoking: 'Revoking...',
      savingOverrideFailed: 'Saving the direct override failed. Please retry.',
      revokingOverrideFailed: 'Revoking the direct override failed. Please retry.',
      savingToolsFailed: 'Saving tool registry changes failed. Please retry.',
      cleanupRemovedPrefix: 'removed',
      never: 'Never',
      allow: 'allow',
      deny: 'deny',
      toolRegistrySaved: (appName, count) => `${appName} now exposes ${count} enabled tools in this tenant.`,
      overrideCreated: (userEmail, effect, appName) =>
        `${userEmail} now has a ${effect} override on ${appName}.`,
      overrideRevoked: (grantId, appName) => `Direct override ${grantId} was revoked from ${appName}.`,
    },
    adminUsers: {
      loading: 'Loading admin users...',
      title: 'Users',
      lead: 'Read-only tenant user inventory with status, MFA, roles, and persisted group membership.',
      totalUsers: 'Total users',
      mfaEnabled: 'MFA enabled',
      pendingReview: 'Pending review',
      snapshot: 'Snapshot',
      lastLogin: 'Last login',
      mfa: 'MFA',
      created: 'Created',
      enabled: 'Enabled',
      disabled: 'Disabled',
      roles: 'Roles',
      noRoles: 'No persisted roles',
      groupMemberships: 'Group memberships',
      noMemberships: 'No persisted memberships',
      primary: 'primary',
      manager: 'manager',
      never: 'Never',
    },
    adminGroups: {
      loading: 'Loading admin groups...',
      title: 'Groups',
      lead:
        'Review persisted group membership volume, manager coverage, and app grants before enabling write controls.',
      totalGroups: 'Total groups',
      totalManagers: 'Total managers',
      totalAppGrants: 'Total app grants',
      snapshot: 'Snapshot',
      members: 'Members',
      managers: 'Managers',
      primaryMembers: 'Primary members',
      grantedApps: 'Granted apps',
      noAppGrants: 'No app grants',
    },
  },
};

export function isSupportedLocale(value: string): value is AppLocale {
  return supportedLocales.includes(value as AppLocale);
}

export function resolveStoredLocale(value: string | null | undefined): AppLocale {
  if (value && isSupportedLocale(value)) {
    return value;
  }

  return defaultLocale;
}

export function getMessages(locale: AppLocale): Messages {
  return messages[locale];
}
