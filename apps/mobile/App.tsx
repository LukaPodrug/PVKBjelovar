import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import QRCode from "react-native-qrcode-svg";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type UserRole = "ADMIN" | "COACH" | "PARENT" | "PLAYER";
type PracticeType = "WATER" | "DRYLAND";

interface AuthUser {
  userId: string;
  role: UserRole;
  email: string | null;
  username: string | null;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

interface ApiErrorResponse {
  message?: string;
}

interface LoginFormState {
  apiBaseUrl: string;
  identifier: string;
  password: string;
}

interface ChangePasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

interface ScheduleCalendarItem {
  id: string;
  scheduleId: string;
  occurrenceId: string | null;
  occurrenceDate: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  notes: string | null;
  isCancelled: boolean;
  sourceType: "WEEKLY_TEMPLATE" | "SPECIAL_PRACTICE";
  category: {
    id: string;
    name: string;
  };
  coaches: Array<{
    coachId: string;
    coach: {
      user: {
        firstName: string;
        lastName: string;
      };
    };
  }>;
}

interface AttendanceQrSessionResponse {
  sessionId: string;
  scheduleId: string;
  occurrenceId: string;
  occurrenceDate: string;
  categoryName: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  expiresAt: string;
  qrValue: string;
}

interface AttendanceScanResponse {
  message: string;
  occurrenceId: string;
  occurrenceDate: string;
  categoryName: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
}

interface ChildCategory {
  id: string;
  name: string;
}

interface AttendanceSummary {
  attended: number;
  total: number;
  percentage: number;
}

interface ParentChildSummary {
  playerId: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  dateOfBirth: string;
  isPrimaryContact: boolean;
  membershipExpiresAt: string | null;
  categories: ChildCategory[];
  attendance: AttendanceSummary;
}

interface ChildScheduleItem {
  scheduleId: string;
  occurrenceId: string | null;
  occurrenceDate: string;
  practiceType: PracticeType;
  startTime: string;
  endTime: string;
  notes: string | null;
  isCancelled: boolean;
  attended: boolean;
  category: {
    id: string;
    name: string;
  };
  coaches: Array<{
    coachId: string;
    coach: {
      user: {
        firstName: string;
        lastName: string;
      };
    };
  }>;
}

type MembershipTone = "active" | "warning" | "expired" | "unset";

interface InboxNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  unreadCount: number;
  notifications: InboxNotification[];
}

interface MeCategory {
  id: string;
  name: string;
}

interface LeaderboardEntry {
  rank: number;
  playerId: string;
  firstName: string;
  lastName: string;
  attended: number;
  total: number;
  percentage: number;
}

interface LeaderboardResponse {
  categoryId: string;
  from: string | null;
  to: string;
  total: number;
  totalEntries: number;
  page: number;
  pageSize: number;
  totalPages: number;
  entries: LeaderboardEntry[];
  highlightPlayerIds: string[];
}

type LeaderboardWindow = "week" | "month" | "all";

const defaultApiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof __DEV__ !== "undefined" && __DEV__ ? "http://127.0.0.1:4000/api" : "");

const roleContent: Record<
  UserRole,
  {
    badge: string;
    title: string;
    description: string;
  }
> = {
  ADMIN: {
    badge: "Administrator",
    title: "QR prijava dolazaka za cijeli klub",
    description:
      "Administratorski mobilni prikaz fokusiran je na brzi odabir termina i otvaranje QR prijave za dolaske.",
  },
  COACH: {
    badge: "Trener",
    title: "Moji treninzi i QR dolasci",
    description:
      "Trener bira trening na koji je dodijeljen, otvara QR kod i prati dolaske igrača bez otvaranja desktop administracije.",
  },
  PARENT: {
    badge: "Roditelj",
    title: "Roditeljski mobilni pregled",
    description:
      "Roditeljski dio ćemo nadograditi oko rasporeda djece, članarina, obavijesti i evidencije dolazaka.",
  },
  PLAYER: {
    badge: "Igrač",
    title: "Prijava dolaska skeniranjem QR koda",
    description:
      "Igrači se prijavljuju korisničkim imenom, mogu ga kasnije promijeniti i skeniranjem QR koda sami evidentiraju dolazak na trening.",
  },
};

const initialLoginForm: LoginFormState = {
  apiBaseUrl: defaultApiBaseUrl,
  identifier: "",
  password: "",
};

const emptyPasswordForm: ChangePasswordFormState = {
  currentPassword: "",
  newPassword: "",
  confirmNewPassword: "",
};

export default function App() {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [loginForm, setLoginForm] = useState<LoginFormState>(initialLoginForm);
  const [passwordForm, setPasswordForm] = useState<ChangePasswordFormState>(emptyPasswordForm);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleLogin() {
    setIsBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = await requestJson<AuthResponse>(normalizeApiBaseUrl(loginForm.apiBaseUrl), "/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: loginForm.identifier.trim(),
          password: loginForm.password,
        }),
      });

      setSession(payload);
      setPasswordForm({
        currentPassword: loginForm.password,
        newPassword: "",
        confirmNewPassword: "",
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Prijava nije uspjela.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePasswordChange() {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await requestJson<{ message: string }>(
        normalizeApiBaseUrl(loginForm.apiBaseUrl),
        "/auth/change-password",
        {
          method: "PATCH",
          token: session.token,
          body: JSON.stringify(passwordForm),
        },
      );

      setSession({
        ...session,
        user: {
          ...session.user,
          mustChangePassword: false,
        },
      });
      setSuccessMessage("Lozinka je uspješno promijenjena.");
      setPasswordForm(emptyPasswordForm);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Promjena lozinke nije uspjela.");
    } finally {
      setIsBusy(false);
    }
  }

  function handleLogout() {
    setSession(null);
    setLoginForm(initialLoginForm);
    setPasswordForm(emptyPasswordForm);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function handleUserUpdate(user: AuthUser) {
    setSession((currentSession) =>
      currentSession
        ? {
            ...currentSession,
            user,
          }
        : currentSession,
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {!session ? (
          <LoginScreen
            form={loginForm}
            errorMessage={errorMessage}
            isBusy={isBusy}
            onChange={setLoginForm}
            onLogin={handleLogin}
          />
        ) : session.user.mustChangePassword ? (
          <PasswordChangeScreen
            form={passwordForm}
            errorMessage={errorMessage}
            isBusy={isBusy}
            user={session.user}
            onChange={setPasswordForm}
            onLogout={handleLogout}
            onSubmit={handlePasswordChange}
          />
        ) : (
          <RoleHomeScreen
            apiBaseUrl={normalizeApiBaseUrl(loginForm.apiBaseUrl)}
            session={session}
            successMessage={successMessage}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LoginScreen({
  form,
  errorMessage,
  isBusy,
  onChange,
  onLogin,
}: {
  form: LoginFormState;
  errorMessage: string | null;
  isBusy: boolean;
  onChange: (value: LoginFormState) => void;
  onLogin: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      <View style={styles.heroPanel}>
        <Text style={styles.heroBadge}>PVK Mladost Bjelovar</Text>
        <Text style={styles.heroTitle}>Mobilna aplikacija kluba</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Prijava</Text>
        <Text style={styles.sectionTitle}>Uđite u aplikaciju</Text>

        <LabeledInput
          label="Prijava"
          value={form.identifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="default"
          onChangeText={(identifier) => onChange({ ...form, identifier })}
        />
        <LabeledInput
          label="Lozinka"
          value={form.password}
          secureTextEntry
          onChangeText={(password) => onChange({ ...form, password })}
        />

        {errorMessage ? <MessageBanner tone="error" message={errorMessage} /> : null}

        <Pressable
          disabled={isBusy}
          style={[styles.primaryButton, isBusy && styles.buttonDisabled]}
          onPress={onLogin}
        >
          {isBusy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Prijava</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function PasswordChangeScreen({
  form,
  errorMessage,
  isBusy,
  user,
  onChange,
  onLogout,
  onSubmit,
}: {
  form: ChangePasswordFormState;
  errorMessage: string | null;
  isBusy: boolean;
  user: AuthUser;
  onChange: (value: ChangePasswordFormState) => void;
  onLogout: () => void;
  onSubmit: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      <View style={styles.heroPanel}>
        <Text style={styles.heroBadge}>{roleContent[user.role].badge}</Text>
        <Text style={styles.heroTitle}>Postavite novu lozinku</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Sigurnost računa</Text>
        <Text style={styles.sectionTitle}>
          {user.firstName} {user.lastName}
        </Text>

        <LabeledInput
          label="Trenutna lozinka"
          value={form.currentPassword}
          secureTextEntry
          onChangeText={(currentPassword) => onChange({ ...form, currentPassword })}
        />
        <LabeledInput
          label="Nova lozinka"
          value={form.newPassword}
          secureTextEntry
          onChangeText={(newPassword) => onChange({ ...form, newPassword })}
        />
        <LabeledInput
          label="Potvrda nove lozinke"
          value={form.confirmNewPassword}
          secureTextEntry
          onChangeText={(confirmNewPassword) => onChange({ ...form, confirmNewPassword })}
        />

        {errorMessage ? <MessageBanner tone="error" message={errorMessage} /> : null}

        <Pressable
          disabled={isBusy}
          style={[styles.primaryButton, isBusy && styles.buttonDisabled]}
          onPress={onSubmit}
        >
          {isBusy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Spremi novu lozinku</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={onLogout}>
          <Text style={styles.secondaryButtonText}>Odjava</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function RoleHomeScreen({
  apiBaseUrl,
  session,
  successMessage,
  onLogout,
  onUserUpdate,
}: {
  apiBaseUrl: string;
  session: AuthResponse;
  successMessage: string | null;
  onLogout: () => void;
  onUserUpdate: (user: AuthUser) => void;
}) {
  const content = roleContent[session.user.role];

  if (session.user.role === "ADMIN" || session.user.role === "COACH") {
    return (
      <StaffAttendanceScreen
        apiBaseUrl={apiBaseUrl}
        session={session}
        headline={content}
        successMessage={successMessage}
        onLogout={onLogout}
      />
    );
  }

  if (session.user.role === "PLAYER") {
    return (
      <PlayerAttendanceScreen
        apiBaseUrl={apiBaseUrl}
        session={session}
        headline={content}
        successMessage={successMessage}
        onLogout={onLogout}
        onUserUpdate={onUserUpdate}
      />
    );
  }

  return (
    <ParentDashboardScreen
      apiBaseUrl={apiBaseUrl}
      session={session}
      headline={content}
      successMessage={successMessage}
      onLogout={onLogout}
    />
  );
}

function StaffAttendanceScreen({
  apiBaseUrl,
  session,
  headline,
  successMessage,
  onLogout,
}: {
  apiBaseUrl: string;
  session: AuthResponse;
  headline: (typeof roleContent)[UserRole];
  successMessage: string | null;
  onLogout: () => void;
}) {
  const [selectedDateKey, setSelectedDateKey] = useState(getCurrentDateKey());
  const [practices, setPractices] = useState<ScheduleCalendarItem[]>([]);
  const [isLoadingPractices, setIsLoadingPractices] = useState(true);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPractice, setSelectedPractice] = useState<ScheduleCalendarItem | null>(null);
  const [qrSession, setQrSession] = useState<AttendanceQrSessionResponse | null>(null);
  const [activeTab, setActiveTab] = useState("practices");
  const visiblePractices = practices.filter((practice) => practice.occurrenceDate === selectedDateKey);

  useEffect(() => {
    let isMounted = true;

    async function loadPractices() {
      setIsLoadingPractices(true);
      setErrorMessage(null);

      try {
        const weekStartDate = getWeekStartKeyForDateKey(selectedDateKey);
        const query = [
          `weekStart=${encodeURIComponent(weekStartDate)}`,
          "includeCancelled=false",
          "assignedOnly=true",
        ]
          .filter(Boolean)
          .join("&");
        const payload = await requestJson<ScheduleCalendarItem[]>(
          apiBaseUrl,
          `/schedules/calendar?${query}`,
          {
            method: "GET",
            token: session.token,
          },
        );

        if (!isMounted) {
          return;
        }

        setPractices(payload);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Termine trenutno nije moguće učitati.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingPractices(false);
        }
      }
    }

    void loadPractices();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, selectedDateKey, session.token]);

  async function handleGenerateQr(practice: ScheduleCalendarItem) {
    setIsLoadingQr(true);
    setErrorMessage(null);
    setSelectedPractice(practice);

    try {
      const payload = await requestJson<AttendanceQrSessionResponse>(
        apiBaseUrl,
        `/schedules/${practice.scheduleId}/attendance-qr`,
        {
          method: "POST",
          token: session.token,
          body: JSON.stringify({
            occurrenceDate: practice.occurrenceDate,
          }),
        },
      );
      setQrSession(payload);
    } catch (error) {
      setQrSession(null);
      setErrorMessage(error instanceof Error ? error.message : "QR kod nije moguće otvoriti.");
    } finally {
      setIsLoadingQr(false);
    }
  }

  const staffTabs: TabItem[] = [
    { key: "practices", label: "Treninzi", icon: "📅" },
    { key: "account", label: "Račun", icon: "👤" },
  ];

  return (
    <View style={styles.tabShell}>
      <CompactHeader
        badge={headline.badge}
        name={`${session.user.firstName} ${session.user.lastName}`}
        subtitle={headline.title}
      />

      <View style={styles.tabBody}>
        {activeTab === "practices" ? (
          <TabScrollView>
            {successMessage ? <MessageBanner tone="success" message={successMessage} /> : null}
            {errorMessage ? <MessageBanner tone="error" message={errorMessage} /> : null}

            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>Odabrani dan</Text>
              <Text style={styles.sectionTitle}>{formatSelectedDayLabel(selectedDateKey)}</Text>
              <View style={styles.inlineActions}>
                <Pressable
                  style={styles.outlineChip}
                  onPress={() => {
                    setSelectedDateKey((currentValue) => shiftDayKey(currentValue, -1));
                    setSelectedPractice(null);
                    setQrSession(null);
                  }}
                >
                  <Text style={styles.outlineChipText}>Prethodni dan</Text>
                </Pressable>
                <Pressable
                  style={styles.outlineChip}
                  onPress={() => {
                    setSelectedDateKey((currentValue) => shiftDayKey(currentValue, 1));
                    setSelectedPractice(null);
                    setQrSession(null);
                  }}
                >
                  <Text style={styles.outlineChipText}>Sljedeći dan</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>Treninzi</Text>
              <Text style={styles.sectionTitle}>Odaberite termin za QR prijavu</Text>

              {isLoadingPractices ? (
                <View style={styles.loadingBlock}>
                  <ActivityIndicator color="#123d75" />
                </View>
              ) : visiblePractices.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>Nema aktivnih treninga za odabrani dan.</Text>
                </View>
              ) : (
                visiblePractices.map((practice) => {
                  const isSelected =
                    selectedPractice?.scheduleId === practice.scheduleId &&
                    selectedPractice.occurrenceDate === practice.occurrenceDate;

                  return (
                    <View
                      key={`${practice.scheduleId}-${practice.occurrenceDate}`}
                      style={[styles.practiceCard, isSelected && styles.practiceCardSelected]}
                    >
                      <View style={styles.practiceCardHeader}>
                        <View style={styles.practiceCardMeta}>
                          <Text style={styles.practiceCardTitle}>{practice.category.name}</Text>
                          <Text style={styles.practiceCardCopy}>
                            {formatPracticeDate(practice.occurrenceDate)} •{" "}
                            {formatPracticeTime(practice)}
                          </Text>
                        </View>
                        <PracticeTypePill practiceType={practice.practiceType} />
                      </View>

                      <Text style={styles.practiceCoachText}>
                        {practice.coaches.length > 0
                          ? practice.coaches
                              .map(
                                (assignment) =>
                                  `${assignment.coach.user.firstName} ${assignment.coach.user.lastName}`,
                              )
                              .join(", ")
                          : "Trener će biti dodijeljen naknadno"}
                      </Text>

                      <Pressable
                        style={styles.primaryInlineButton}
                        disabled={isLoadingQr}
                        onPress={() => handleGenerateQr(practice)}
                      >
                        {isLoadingQr && isSelected ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <Text style={styles.primaryInlineButtonText}>Prikaži QR kod</Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          </TabScrollView>
        ) : (
          <TabScrollView>
            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>Aktivni račun</Text>
              <Text style={styles.sectionTitle}>{headline.description}</Text>
              <View style={styles.summaryRow}>
                <SummaryPill label="Uloga" value={headline.badge} />
                <SummaryPill label="Prijava" value={session.user.email ?? session.user.username ?? "-"} />
              </View>
            </View>

            <Pressable style={styles.secondaryButton} onPress={onLogout}>
              <Text style={styles.secondaryButtonText}>Odjava</Text>
            </Pressable>
          </TabScrollView>
        )}
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={qrSession !== null}
        onRequestClose={() => {
          setQrSession(null);
          setSelectedPractice(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.sectionEyebrow}>QR prijava</Text>
                <Text style={styles.modalTitle}>{qrSession?.categoryName ?? "Termin"}</Text>
                {qrSession ? (
                  <Text style={styles.modalSubtitle}>
                    {formatPracticeDate(qrSession.occurrenceDate)} •{" "}
                    {formatTimeRange(qrSession.startTime, qrSession.endTime)}
                  </Text>
                ) : null}
              </View>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => {
                  setQrSession(null);
                  setSelectedPractice(null);
                }}
              >
                <Text style={styles.modalCloseButtonText}>Zatvori</Text>
              </Pressable>
            </View>

            {qrSession ? (
              <>
                <View style={styles.qrCard}>
                  <QRCode value={qrSession.qrValue} size={220} />
                </View>

                <View style={styles.infoPanel}>
                  <Text style={styles.infoLabel}>Vrijedi do</Text>
                  <Text style={styles.infoValue}>{formatDateTimeValue(qrSession.expiresAt)}</Text>
                </View>

                <Pressable
                  style={styles.primaryButton}
                  disabled={isLoadingQr || !selectedPractice}
                  onPress={() => {
                    if (selectedPractice) {
                      void handleGenerateQr(selectedPractice);
                    }
                  }}
                >
                  {isLoadingQr ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Osvježi QR kod</Text>
                  )}
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
      <TabBar items={staffTabs} activeKey={activeTab} onSelect={setActiveTab} />
    </View>
  );
}

interface TabItem {
  key: string;
  label: string;
  icon: string;
}

function CompactHeader({
  badge,
  name,
  subtitle,
}: {
  badge: string;
  name: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.tabHeader}>
      <Text style={styles.tabHeaderBadge}>{badge}</Text>
      <Text style={styles.tabHeaderName}>{name}</Text>
      {subtitle ? <Text style={styles.tabHeaderSub}>{subtitle}</Text> : null}
    </View>
  );
}

function TabBar({
  items,
  activeKey,
  onSelect,
}: {
  items: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={styles.tabBar}>
      {items.map((item) => {
        const isActive = item.key === activeKey;

        return (
          <Pressable key={item.key} style={styles.tabBarItem} onPress={() => onSelect(item.key)}>
            <Text style={[styles.tabBarIcon, isActive && styles.tabBarIconActive]}>{item.icon}</Text>
            <Text
              numberOfLines={1}
              style={[styles.tabBarLabel, isActive && styles.tabBarLabelActive]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabScrollView({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={styles.tabContent}>{children}</ScrollView>;
}

function PracticeRow({ practice }: { practice: ChildScheduleItem }) {
  return (
    <View style={[styles.practiceCard, practice.isCancelled && styles.practiceCardCancelled]}>
      <View style={styles.practiceCardHeader}>
        <View style={styles.practiceCardMeta}>
          <Text style={styles.practiceCardTitle}>{practice.category.name}</Text>
          <Text style={styles.practiceCardCopy}>
            {formatPracticeDate(practice.occurrenceDate)} • {formatPracticeTime(practice)}
          </Text>
        </View>
        <PracticeTypePill practiceType={practice.practiceType} />
      </View>

      <Text style={styles.practiceCoachText}>
        {practice.coaches.length > 0
          ? practice.coaches
              .map(
                (assignment) =>
                  `${assignment.coach.user.firstName} ${assignment.coach.user.lastName}`,
              )
              .join(", ")
          : "Trener će biti dodijeljen naknadno"}
      </Text>

      {practice.isCancelled ? (
        <View style={[styles.statusTag, styles.statusTagCancelled]}>
          <Text style={styles.statusTagText}>Trening je otkazan</Text>
        </View>
      ) : practice.attended ? (
        <View style={[styles.statusTag, styles.statusTagAttended]}>
          <Text style={styles.statusTagText}>Dolazak evidentiran</Text>
        </View>
      ) : null}
    </View>
  );
}

function WeeklySchedulePanel({
  apiBaseUrl,
  token,
  endpoint,
}: {
  apiBaseUrl: string;
  token: string;
  endpoint: string;
}) {
  const [selectedDateKey, setSelectedDateKey] = useState(getCurrentDateKey());
  const [scheduleItems, setScheduleItems] = useState<ChildScheduleItem[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSchedule() {
      setIsLoadingSchedule(true);
      setScheduleError(null);

      try {
        const weekStart = getWeekStartKeyForDateKey(selectedDateKey);
        const separator = endpoint.includes("?") ? "&" : "?";
        const payload = await requestJson<ChildScheduleItem[]>(
          apiBaseUrl,
          `${endpoint}${separator}weekStart=${encodeURIComponent(weekStart)}`,
          { method: "GET", token },
        );

        if (isMounted) {
          setScheduleItems(payload);
        }
      } catch (error) {
        if (isMounted) {
          setScheduleError(
            error instanceof Error ? error.message : "Raspored treninga nije moguće učitati.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingSchedule(false);
        }
      }
    }

    void loadSchedule();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, token, endpoint, selectedDateKey]);

  const visiblePractices = scheduleItems.filter((item) => item.occurrenceDate === selectedDateKey);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Odabrani dan</Text>
        <Text style={styles.sectionTitle}>{formatSelectedDayLabel(selectedDateKey)}</Text>
        <View style={styles.inlineActions}>
          <Pressable
            style={styles.outlineChip}
            onPress={() => setSelectedDateKey((currentValue) => shiftDayKey(currentValue, -1))}
          >
            <Text style={styles.outlineChipText}>Prethodni dan</Text>
          </Pressable>
          <Pressable
            style={styles.outlineChip}
            onPress={() => setSelectedDateKey((currentValue) => shiftDayKey(currentValue, 1))}
          >
            <Text style={styles.outlineChipText}>Sljedeći dan</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Raspored</Text>
        <Text style={styles.sectionTitle}>Treninzi za odabrani dan</Text>

        {scheduleError ? <MessageBanner tone="error" message={scheduleError} /> : null}

        {isLoadingSchedule ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color="#123d75" />
          </View>
        ) : visiblePractices.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Nema treninga za odabrani dan.</Text>
          </View>
        ) : (
          visiblePractices.map((practice) => (
            <PracticeRow
              key={`${practice.scheduleId}-${practice.occurrenceDate}`}
              practice={practice}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function PlayerAttendanceScreen({
  apiBaseUrl,
  session,
  headline,
  successMessage,
  onLogout,
  onUserUpdate,
}: {
  apiBaseUrl: string;
  session: AuthResponse;
  headline: (typeof roleContent)[UserRole];
  successMessage: string | null;
  onLogout: () => void;
  onUserUpdate: (user: AuthUser) => void;
}) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [username, setUsername] = useState(session.user.username ?? "");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSubmittingScan, setIsSubmittingScan] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [categories, setCategories] = useState<MeCategory[]>([]);
  const [activeTab, setActiveTab] = useState("schedule");

  useEffect(() => {
    setUsername(session.user.username ?? "");
  }, [session.user.username]);

  useEffect(() => {
    let isActive = true;

    void registerForPushNotifications(apiBaseUrl, session.token).then((token) => {
      if (isActive) {
        setPushToken(token);
      }
    });

    requestJson<MeCategory[]>(apiBaseUrl, "/me/categories", {
      method: "GET",
      token: session.token,
    })
      .then((payload) => {
        if (isActive) {
          setCategories(payload);
        }
      })
      .catch(() => {
        if (isActive) {
          setCategories([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [apiBaseUrl, session.token]);

  async function handleLogout() {
    if (pushToken) {
      try {
        await requestJson(apiBaseUrl, `/me/push-devices/${encodeURIComponent(pushToken)}`, {
          method: "DELETE",
          token: session.token,
        });
      } catch (error) {
        console.warn("Push token removal failed", error);
      }
    }

    onLogout();
  }

  async function handleSaveUsername() {
    setIsSavingUsername(true);
    setErrorMessage(null);
    setProfileMessage(null);

    try {
      const payload = await requestJson<{ user: AuthUser }>(apiBaseUrl, "/auth/profile", {
        method: "PATCH",
        token: session.token,
        body: JSON.stringify({
          username,
        }),
      });
      onUserUpdate(payload.user);
      setProfileMessage("Korisničko ime je uspješno ažurirano.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Korisničko ime nije moguće spremiti.",
      );
    } finally {
      setIsSavingUsername(false);
    }
  }

  async function handleOpenScanner() {
    setErrorMessage(null);
    setScanMessage(null);

    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission();

      if (!permissionResult.granted) {
        setErrorMessage("Bez dopuštenja za kameru nije moguće skenirati QR kod.");
        return;
      }
    }

    setIsScannerOpen(true);
  }

  async function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (isSubmittingScan) {
      return;
    }

    setIsSubmittingScan(true);
    setErrorMessage(null);

    try {
      const payload = await requestJson<AttendanceScanResponse>(
        apiBaseUrl,
        "/schedules/attendance-qr/scan",
        {
          method: "POST",
          token: session.token,
          body: JSON.stringify({
            qrToken: result.data,
          }),
        },
      );

      setIsScannerOpen(false);
      setScanMessage(
        `${payload.message} ${payload.categoryName} • ${formatPracticeDate(payload.occurrenceDate)} • ${formatTimeRange(payload.startTime, payload.endTime)}`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Skeniranje nije uspjelo.");
    } finally {
      setIsSubmittingScan(false);
    }
  }

  const playerTabs: TabItem[] = [
    { key: "schedule", label: "Raspored", icon: "📅" },
    { key: "checkin", label: "Dolazak", icon: "📷" },
    { key: "leaderboard", label: "Poredak", icon: "🏆" },
    { key: "notifications", label: "Obavijesti", icon: "🔔" },
    { key: "profile", label: "Profil", icon: "👤" },
  ];

  return (
    <View style={styles.tabShell}>
      <CompactHeader
        badge={headline.badge}
        name={`${session.user.firstName} ${session.user.lastName}`}
      />

      <View style={styles.tabBody}>
        {activeTab === "schedule" ? (
          <WeeklySchedulePanel apiBaseUrl={apiBaseUrl} token={session.token} endpoint="/me/schedule" />
        ) : activeTab === "checkin" ? (
          <TabScrollView>
            {scanMessage ? <MessageBanner tone="success" message={scanMessage} /> : null}
            {errorMessage ? <MessageBanner tone="error" message={errorMessage} /> : null}

            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>Dolazak na trening</Text>
              <Text style={styles.sectionTitle}>Skeniraj QR kod</Text>

              {!isScannerOpen ? (
                <Pressable style={styles.primaryButton} onPress={handleOpenScanner}>
                  <Text style={styles.primaryButtonText}>Otvori skener</Text>
                </Pressable>
              ) : (
                <>
                  <View style={styles.scannerWrap}>
                    <CameraView
                      style={styles.scannerView}
                      facing="back"
                      barcodeScannerSettings={{
                        barcodeTypes: ["qr"],
                      }}
                      onBarcodeScanned={isSubmittingScan ? undefined : handleBarcodeScanned}
                    />
                  </View>

                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => {
                      setIsScannerOpen(false);
                      setIsSubmittingScan(false);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Zatvori skener</Text>
                  </Pressable>
                </>
              )}
            </View>
          </TabScrollView>
        ) : activeTab === "leaderboard" ? (
          <TabScrollView>
            <LeaderboardCard apiBaseUrl={apiBaseUrl} token={session.token} categories={categories} />
          </TabScrollView>
        ) : activeTab === "notifications" ? (
          <TabScrollView>
            <NotificationsInbox apiBaseUrl={apiBaseUrl} token={session.token} />
          </TabScrollView>
        ) : (
          <TabScrollView>
            {successMessage ? <MessageBanner tone="success" message={successMessage} /> : null}
            {profileMessage ? <MessageBanner tone="success" message={profileMessage} /> : null}
            {errorMessage ? <MessageBanner tone="error" message={errorMessage} /> : null}

            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>Moj račun</Text>
              <Text style={styles.sectionTitle}>Korisničko ime za prijavu</Text>
              <Text style={styles.sectionCopy}>
                Trenutna prijava: {session.user.username ?? "nije postavljeno"}.
              </Text>

              <LabeledInput
                label="Korisničko ime"
                value={username}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setUsername}
              />

              <Pressable
                disabled={isSavingUsername}
                style={[styles.primaryButton, isSavingUsername && styles.buttonDisabled]}
                onPress={handleSaveUsername}
              >
                {isSavingUsername ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Spremi korisničko ime</Text>
                )}
              </Pressable>
            </View>

            <Pressable style={styles.secondaryButton} onPress={handleLogout}>
              <Text style={styles.secondaryButtonText}>Odjava</Text>
            </Pressable>
          </TabScrollView>
        )}
      </View>

      <TabBar items={playerTabs} activeKey={activeTab} onSelect={setActiveTab} />
    </View>
  );
}

function ParentDashboardScreen({
  apiBaseUrl,
  session,
  headline,
  successMessage,
  onLogout,
}: {
  apiBaseUrl: string;
  session: AuthResponse;
  headline: (typeof roleContent)[UserRole];
  successMessage: string | null;
  onLogout: () => void;
}) {
  const [children, setChildren] = useState<ParentChildSummary[]>([]);
  const [isLoadingChildren, setIsLoadingChildren] = useState(true);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    let isActive = true;

    void registerForPushNotifications(apiBaseUrl, session.token).then((token) => {
      if (isActive) {
        setPushToken(token);
      }
    });

    return () => {
      isActive = false;
    };
  }, [apiBaseUrl, session.token]);

  async function handleLogout() {
    if (pushToken) {
      try {
        await requestJson(apiBaseUrl, `/me/push-devices/${encodeURIComponent(pushToken)}`, {
          method: "DELETE",
          token: session.token,
        });
      } catch (error) {
        console.warn("Push token removal failed", error);
      }
    }

    onLogout();
  }

  useEffect(() => {
    let isMounted = true;

    async function loadChildren() {
      setIsLoadingChildren(true);
      setChildrenError(null);

      try {
        const payload = await requestJson<ParentChildSummary[]>(apiBaseUrl, "/me/children", {
          method: "GET",
          token: session.token,
        });

        if (!isMounted) {
          return;
        }

        setChildren(payload);
        setSelectedChildId((current) => {
          if (current && payload.some((child) => child.playerId === current)) {
            return current;
          }

          return payload.length === 1 ? payload[0]?.playerId ?? null : null;
        });
      } catch (error) {
        if (isMounted) {
          setChildrenError(
            error instanceof Error ? error.message : "Podatke o djeci nije moguće učitati.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingChildren(false);
        }
      }
    }

    void loadChildren();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, session.token]);

  const selectedChild = children.find((child) => child.playerId === selectedChildId) ?? null;

  const parentTabs: TabItem[] = [
    { key: "overview", label: "Pregled", icon: "🏠" },
    { key: "schedule", label: "Raspored", icon: "📅" },
    { key: "leaderboard", label: "Poredak", icon: "🏆" },
    { key: "notifications", label: "Obavijesti", icon: "🔔" },
    { key: "profile", label: "Profil", icon: "👤" },
  ];

  const noChildrenNotice = (
    <View style={styles.card}>
      <Text style={styles.sectionEyebrow}>Nema povezane djece</Text>
      <Text style={styles.sectionTitle}>Vaš račun još nije povezan s igračima</Text>
    </View>
  );

  function renderChildScopedTab(render: (child: ParentChildSummary) => ReactNode) {
    if (isLoadingChildren) {
      return (
        <TabScrollView>
          <View style={styles.card}>
            <View style={styles.loadingBlock}>
              <ActivityIndicator color="#123d75" />
            </View>
          </View>
        </TabScrollView>
      );
    }

    if (!selectedChild) {
      return <TabScrollView>{noChildrenNotice}</TabScrollView>;
    }

    return render(selectedChild);
  }

  const loadingChildrenView = (
    <View style={styles.tabBody}>
      <TabScrollView>
        <View style={styles.card}>
          <View style={styles.loadingBlock}>
            <ActivityIndicator color="#123d75" />
          </View>
        </View>
      </TabScrollView>
    </View>
  );

  const childPickerView = (
    <View style={styles.tabBody}>
      <ParentChildPicker
        children={children}
        errorMessage={childrenError}
        onSelectChild={(childId) => {
          setSelectedChildId(childId);
          setActiveTab("overview");
        }}
      />
    </View>
  );

  return (
    <View style={styles.tabShell}>
      <CompactHeader
        badge={headline.badge}
        name={`${session.user.firstName} ${session.user.lastName}`}
      />

      {isLoadingChildren ? (
        loadingChildrenView
      ) : children.length > 1 && !selectedChild ? (
        childPickerView
      ) : (
        <>
          {children.length > 1 && selectedChild ? (
            <View style={styles.selectedChildBar}>
              <View style={styles.selectedChildCopy}>
                <Text style={styles.selectedChildLabel}>Odabrano dijete</Text>
                <Text style={styles.selectedChildName}>
                  {selectedChild.firstName} {selectedChild.lastName}
                </Text>
              </View>
              <Pressable
                style={styles.changeChildButton}
                onPress={() => {
                  setSelectedChildId(null);
                  setActiveTab("overview");
                }}
              >
                <Text style={styles.changeChildButtonText}>Promijeni</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.tabBody}>
            {activeTab === "overview" ? (
              renderChildScopedTab((child) => (
                <TabScrollView>
                  {childrenError ? <MessageBanner tone="error" message={childrenError} /> : null}
                  <ChildOverviewPanel child={child} />
                </TabScrollView>
              ))
            ) : activeTab === "schedule" ? (
              renderChildScopedTab((child) => (
                <WeeklySchedulePanel
                  apiBaseUrl={apiBaseUrl}
                  token={session.token}
                  endpoint={`/me/children/${child.playerId}/schedule`}
                />
              ))
            ) : activeTab === "leaderboard" ? (
              renderChildScopedTab((child) => (
                <TabScrollView>
                  <LeaderboardCard
                    apiBaseUrl={apiBaseUrl}
                    token={session.token}
                    categories={child.categories}
                  />
                </TabScrollView>
              ))
            ) : activeTab === "notifications" ? (
              <TabScrollView>
                <NotificationsInbox apiBaseUrl={apiBaseUrl} token={session.token} />
              </TabScrollView>
            ) : (
              <TabScrollView>
                {successMessage ? <MessageBanner tone="success" message={successMessage} /> : null}
                <View style={styles.card}>
                  <Text style={styles.sectionEyebrow}>Račun</Text>
                  <Text style={styles.sectionTitle}>
                    {session.user.firstName} {session.user.lastName}
                  </Text>
                  <Text style={styles.sectionCopy}>Prijava: {session.user.email ?? "-"}</Text>
                </View>
                <Pressable style={styles.secondaryButton} onPress={handleLogout}>
                  <Text style={styles.secondaryButtonText}>Odjava</Text>
                </Pressable>
              </TabScrollView>
            )}
          </View>

          <TabBar items={parentTabs} activeKey={activeTab} onSelect={setActiveTab} />
        </>
      )}
    </View>
  );
}

function ParentChildPicker({
  children,
  errorMessage,
  onSelectChild,
}: {
  children: ParentChildSummary[];
  errorMessage: string | null;
  onSelectChild: (childId: string) => void;
}) {
  return (
    <TabScrollView>
      {errorMessage ? <MessageBanner tone="error" message={errorMessage} /> : null}

      {children.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionEyebrow}>Nema povezane djece</Text>
          <Text style={styles.sectionTitle}>Vaš račun još nije povezan s igračima</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionEyebrow}>Odabir djeteta</Text>
          <Text style={styles.sectionTitle}>Koga želite pregledati?</Text>

          <View style={styles.childPickerList}>
            {children.map((child) => (
              <Pressable
                key={child.playerId}
                style={styles.childPickerItem}
                onPress={() => onSelectChild(child.playerId)}
              >
                <View style={styles.childPickerAvatar}>
                  <Text style={styles.childPickerAvatarText}>
                    {child.firstName.charAt(0)}
                    {child.lastName.charAt(0)}
                  </Text>
                </View>
                <View style={styles.childPickerMeta}>
                  <Text style={styles.childPickerName}>
                    {child.firstName} {child.lastName}
                  </Text>
                  <Text style={styles.childPickerCopy}>
                    {child.categories.map((category) => category.name).join(", ") || "Bez kategorije"}
                  </Text>
                </View>
                <Text style={styles.childPickerArrow}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </TabScrollView>
  );
}

function NotificationsInbox({
  apiBaseUrl,
  token,
}: {
  apiBaseUrl: string;
  token: string;
}) {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadNotifications() {
    try {
      const payload = await requestJson<NotificationsResponse>(apiBaseUrl, "/me/notifications", {
        method: "GET",
        token,
      });
      setNotifications(payload.notifications);
      setUnreadCount(payload.unreadCount);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Obavijesti nije moguće učitati.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();

    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      void loadNotifications();
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(() => {
      void loadNotifications();
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl, token]);

  async function handleMarkRead(notificationId: string) {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId && notification.readAt === null
          ? { ...notification, readAt: new Date().toISOString() }
          : notification,
      ),
    );
    setUnreadCount((current) => Math.max(0, current - 1));

    try {
      await requestJson(apiBaseUrl, `/me/notifications/${notificationId}/read`, {
        method: "PATCH",
        token,
      });
    } catch (markError) {
      console.warn("Marking notification read failed", markError);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((current) =>
      current.map((notification) =>
        notification.readAt === null
          ? { ...notification, readAt: new Date().toISOString() }
          : notification,
      ),
    );
    setUnreadCount(0);

    try {
      await requestJson(apiBaseUrl, "/me/notifications/read-all", {
        method: "PATCH",
        token,
      });
    } catch (markError) {
      console.warn("Marking all notifications read failed", markError);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.inboxHeader}>
        <View style={styles.inboxHeaderCopy}>
          <Text style={styles.sectionEyebrow}>Obavijesti</Text>
          <Text style={styles.sectionTitle}>Novosti kluba</Text>
        </View>
        {unreadCount > 0 ? (
          <View style={styles.inboxBadge}>
            <Text style={styles.inboxBadgeText}>{unreadCount}</Text>
          </View>
        ) : null}
      </View>

      {error ? <MessageBanner tone="error" message={error} /> : null}

      {isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color="#123d75" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Trenutno nemate novih obavijesti.</Text>
        </View>
      ) : (
        <>
          {unreadCount > 0 ? (
            <Pressable style={styles.inboxMarkAllButton} onPress={handleMarkAllRead}>
              <Text style={styles.inboxMarkAllText}>Označi sve kao pročitano</Text>
            </Pressable>
          ) : null}

          {notifications.map((notification) => {
            const isUnread = notification.readAt === null;

            return (
              <Pressable
                key={notification.id}
                style={[styles.inboxItem, isUnread && styles.inboxItemUnread]}
                onPress={() => (isUnread ? void handleMarkRead(notification.id) : undefined)}
              >
                <View style={styles.inboxItemHeader}>
                  <Text style={styles.inboxItemTitle}>{notification.title}</Text>
                  {isUnread ? <View style={styles.inboxUnreadDot} /> : null}
                </View>
                <Text style={styles.inboxItemBody}>{notification.body}</Text>
                <Text style={styles.inboxItemMeta}>{formatDateTimeValue(notification.createdAt)}</Text>
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
}

async function registerForPushNotifications(
  apiBaseUrl: string,
  sessionToken: string,
): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      return null;
    }

    const currentPermissions = await Notifications.getPermissionsAsync();
    let status = currentPermissions.status;

    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== "granted") {
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Obavijesti",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const expoPushToken = tokenResponse.data;

    await requestJson(apiBaseUrl, "/me/push-devices", {
      method: "POST",
      token: sessionToken,
      body: JSON.stringify({
        expoPushToken,
        platform: Platform.OS === "ios" ? "IOS" : Platform.OS === "android" ? "ANDROID" : "WEB",
      }),
    });

    return expoPushToken;
  } catch (error) {
    console.warn("Push registration skipped", error);
    return null;
  }
}

const leaderboardWindowOptions: Array<{ value: LeaderboardWindow; label: string }> = [
  { value: "week", label: "Tjedan" },
  { value: "month", label: "Mjesec" },
  { value: "all", label: "Sezona" },
];

const rankMedals: Record<number, string> = {
  1: "🏆",
  2: "🥈",
  3: "🥉",
};

const leaderboardPageSize = 10;

function resolveLeaderboardRange(window: LeaderboardWindow): { from?: string; to?: string } {
  if (window === "all") {
    return {};
  }

  const now = new Date();

  if (window === "week") {
    const start = getWeekStartDate(now);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { from: formatDateKey(start), to: formatDateKey(end) };
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: formatDateKey(start), to: formatDateKey(end) };
}

function LeaderboardCard({
  apiBaseUrl,
  token,
  categories,
}: {
  apiBaseUrl: string;
  token: string;
  categories: MeCategory[];
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [window, setWindow] = useState<LeaderboardWindow>("all");
  const [page, setPage] = useState(1);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCategoryId || !categories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(categories[0]?.id ?? null);
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (!selectedCategoryId) {
      setLeaderboard(null);
      setIsLoading(false);
      return;
    }

    let isActive = true;

    async function loadLeaderboard() {
      setIsLoading(true);
      setError(null);

      try {
        const range = resolveLeaderboardRange(window);
        const query = [
          `categoryId=${encodeURIComponent(selectedCategoryId!)}`,
          `page=${page}`,
          `pageSize=${leaderboardPageSize}`,
          range.from ? `from=${range.from}` : "",
          range.to ? `to=${range.to}` : "",
        ]
          .filter(Boolean)
          .join("&");
        const payload = await requestJson<LeaderboardResponse>(
          apiBaseUrl,
          `/me/leaderboard?${query}`,
          { method: "GET", token },
        );

        if (isActive) {
          setLeaderboard(payload);
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "Poredak nije moguće učitati.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadLeaderboard();

    return () => {
      isActive = false;
    };
  }, [apiBaseUrl, token, selectedCategoryId, window, page]);

  if (categories.length === 0) {
    return null;
  }

  const highlightIds = new Set(leaderboard?.highlightPlayerIds ?? []);
  const entries = leaderboard?.entries ?? [];

  return (
    <View style={styles.card}>
      <Text style={styles.sectionEyebrow}>Poredak</Text>
      <Text style={styles.sectionTitle}>Ljestvica dolazaka</Text>

      {categories.length > 1 ? (
        <View style={styles.leaderboardChipRow}>
          {categories.map((category) => {
            const isSelected = category.id === selectedCategoryId;

            return (
              <Pressable
                key={category.id}
                style={[styles.leaderboardChip, isSelected && styles.leaderboardChipSelected]}
                onPress={() => {
                  setSelectedCategoryId(category.id);
                  setPage(1);
                }}
              >
                <Text
                  style={[
                    styles.leaderboardChipText,
                    isSelected && styles.leaderboardChipTextSelected,
                  ]}
                >
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.leaderboardChipRow}>
        {leaderboardWindowOptions.map((option) => {
          const isSelected = option.value === window;

          return (
            <Pressable
              key={option.value}
              style={[styles.leaderboardChip, isSelected && styles.leaderboardChipSelected]}
              onPress={() => {
                setWindow(option.value);
                setPage(1);
              }}
            >
              <Text
                style={[
                  styles.leaderboardChipText,
                  isSelected && styles.leaderboardChipTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <MessageBanner tone="error" message={error} /> : null}

      {isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color="#123d75" />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Još nema odrađenih treninga za poredak.</Text>
        </View>
      ) : (
        <>
          {entries.map((entry) => (
            <LeaderboardRow
              key={entry.playerId}
              entry={entry}
              isHighlighted={highlightIds.has(entry.playerId)}
            />
          ))}

          {leaderboard && leaderboard.totalPages > 1 ? (
            <View style={styles.leaderboardPagination}>
              <Pressable
                disabled={leaderboard.page <= 1}
                style={[
                  styles.outlineChip,
                  leaderboard.page <= 1 && styles.paginationButtonDisabled,
                ]}
                onPress={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              >
                <Text style={styles.outlineChipText}>Prethodna</Text>
              </Pressable>
              <Text style={styles.leaderboardPaginationText}>
                {leaderboard.page} / {leaderboard.totalPages}
              </Text>
              <Pressable
                disabled={leaderboard.page >= leaderboard.totalPages}
                style={[
                  styles.outlineChip,
                  leaderboard.page >= leaderboard.totalPages && styles.paginationButtonDisabled,
                ]}
                onPress={() =>
                  setPage((currentPage) =>
                    Math.min(leaderboard.totalPages, currentPage + 1),
                  )
                }
              >
                <Text style={styles.outlineChipText}>Sljedeća</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function LeaderboardRow({
  entry,
  isHighlighted,
}: {
  entry: LeaderboardEntry;
  isHighlighted: boolean;
}) {
  return (
    <View style={[styles.leaderboardRow, isHighlighted && styles.leaderboardRowHighlighted]}>
      <View style={styles.leaderboardRank}>
        <Text style={styles.leaderboardRankText}>{rankMedals[entry.rank] ?? `${entry.rank}.`}</Text>
      </View>
      <View style={styles.leaderboardRowMeta}>
        <Text style={styles.leaderboardRowName}>
          {entry.firstName} {entry.lastName}
        </Text>
        <Text style={styles.leaderboardRowCopy}>
          {entry.attended} / {entry.total} treninga
        </Text>
      </View>
      <View style={styles.leaderboardPercentPill}>
        <Text style={styles.leaderboardPercentText}>{entry.percentage}%</Text>
      </View>
    </View>
  );
}

function ChildOverviewPanel({ child }: { child: ParentChildSummary }) {
  const membership = describeMembership(child.membershipExpiresAt);

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Profil djeteta</Text>
        <Text style={styles.sectionTitle}>
          {child.firstName} {child.lastName}
        </Text>

        <View style={styles.categoryBadgeRow}>
          {child.categories.length > 0 ? (
            child.categories.map((category) => (
              <View key={category.id} style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{category.name}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.sectionCopy}>Dijete još nije raspoređeno u kategoriju.</Text>
          )}
        </View>

        <View style={[styles.membershipBadge, membershipToneStyle(membership.tone)]}>
          <Text style={styles.membershipLabel}>Članarina</Text>
          <Text style={styles.membershipValue}>{membership.label}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Dolasci</Text>
        <Text style={styles.sectionTitle}>Evidencija dolazaka</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreValue}>{child.attendance.percentage}%</Text>
          <Text style={styles.scoreCaption}>
            {child.attendance.attended} / {child.attendance.total} treninga
          </Text>
        </View>
        <View style={styles.scoreBar}>
          <View style={[styles.scoreBarFill, { width: `${child.attendance.percentage}%` }]} />
        </View>
      </View>
    </>
  );
}

function ChildOverview({
  apiBaseUrl,
  token,
  child,
}: {
  apiBaseUrl: string;
  token: string;
  child: ParentChildSummary;
}) {
  const [selectedDateKey, setSelectedDateKey] = useState(getCurrentDateKey());
  const [scheduleItems, setScheduleItems] = useState<ChildScheduleItem[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSchedule() {
      setIsLoadingSchedule(true);
      setScheduleError(null);

      try {
        const weekStart = getWeekStartKeyForDateKey(selectedDateKey);
        const payload = await requestJson<ChildScheduleItem[]>(
          apiBaseUrl,
          `/me/children/${child.playerId}/schedule?weekStart=${encodeURIComponent(weekStart)}`,
          {
            method: "GET",
            token,
          },
        );

        if (!isMounted) {
          return;
        }

        setScheduleItems(payload);
      } catch (error) {
        if (isMounted) {
          setScheduleError(
            error instanceof Error ? error.message : "Raspored treninga nije moguće učitati.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingSchedule(false);
        }
      }
    }

    void loadSchedule();

    return () => {
      isMounted = false;
    };
  }, [apiBaseUrl, token, child.playerId, selectedDateKey]);

  const membership = describeMembership(child.membershipExpiresAt);
  const visiblePractices = scheduleItems.filter((item) => item.occurrenceDate === selectedDateKey);

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Profil djeteta</Text>
        <Text style={styles.sectionTitle}>
          {child.firstName} {child.lastName}
        </Text>

        <View style={styles.categoryBadgeRow}>
          {child.categories.length > 0 ? (
            child.categories.map((category) => (
              <View key={category.id} style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{category.name}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.sectionCopy}>Dijete još nije raspoređeno u kategoriju.</Text>
          )}
        </View>

        <View style={[styles.membershipBadge, membershipToneStyle(membership.tone)]}>
          <Text style={styles.membershipLabel}>Članarina</Text>
          <Text style={styles.membershipValue}>{membership.label}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Dolasci</Text>
        <Text style={styles.sectionTitle}>Evidencija dolazaka</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreValue}>{child.attendance.percentage}%</Text>
          <Text style={styles.scoreCaption}>
            {child.attendance.attended} / {child.attendance.total} treninga
          </Text>
        </View>
        <View style={styles.scoreBar}>
          <View style={[styles.scoreBarFill, { width: `${child.attendance.percentage}%` }]} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Odabrani dan</Text>
        <Text style={styles.sectionTitle}>{formatSelectedDayLabel(selectedDateKey)}</Text>
        <View style={styles.inlineActions}>
          <Pressable
            style={styles.outlineChip}
            onPress={() => setSelectedDateKey((currentValue) => shiftDayKey(currentValue, -1))}
          >
            <Text style={styles.outlineChipText}>Prethodni dan</Text>
          </Pressable>
          <Pressable
            style={styles.outlineChip}
            onPress={() => setSelectedDateKey((currentValue) => shiftDayKey(currentValue, 1))}
          >
            <Text style={styles.outlineChipText}>Sljedeći dan</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>Raspored</Text>
        <Text style={styles.sectionTitle}>Treninzi za odabrani dan</Text>

        {scheduleError ? <MessageBanner tone="error" message={scheduleError} /> : null}

        {isLoadingSchedule ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color="#123d75" />
          </View>
        ) : visiblePractices.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Nema treninga za odabrani dan.</Text>
          </View>
        ) : (
          visiblePractices.map((practice) => (
            <View
              key={`${practice.scheduleId}-${practice.occurrenceDate}`}
              style={[styles.practiceCard, practice.isCancelled && styles.practiceCardCancelled]}
            >
              <View style={styles.practiceCardHeader}>
                <View style={styles.practiceCardMeta}>
                  <Text style={styles.practiceCardTitle}>{practice.category.name}</Text>
                  <Text style={styles.practiceCardCopy}>
                    {formatPracticeDate(practice.occurrenceDate)} • {formatPracticeTime(practice)}
                  </Text>
                </View>
                <PracticeTypePill practiceType={practice.practiceType} />
              </View>

              <Text style={styles.practiceCoachText}>
                {practice.coaches.length > 0
                  ? practice.coaches
                      .map(
                        (assignment) =>
                          `${assignment.coach.user.firstName} ${assignment.coach.user.lastName}`,
                      )
                      .join(", ")
                  : "Trener će biti dodijeljen naknadno"}
              </Text>

              {practice.isCancelled ? (
                <View style={[styles.statusTag, styles.statusTagCancelled]}>
                  <Text style={styles.statusTagText}>Trening je otkazan</Text>
                </View>
              ) : practice.attended ? (
                <View style={[styles.statusTag, styles.statusTagAttended]}>
                  <Text style={styles.statusTagText}>Dolazak evidentiran</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>

      <LeaderboardCard apiBaseUrl={apiBaseUrl} token={token} categories={child.categories} />
    </>
  );
}

function describeMembership(expiresAt: string | null): {
  label: string;
  tone: MembershipTone;
} {
  if (!expiresAt) {
    return { label: "Nije postavljeno", tone: "unset" };
  }

  const expiry = new Date(expiresAt);
  const now = new Date();
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / millisecondsPerDay);
  const dateLabel = formatDateValue(expiresAt);

  if (daysRemaining < 0) {
    return { label: `Isteklo ${dateLabel}`, tone: "expired" };
  }

  if (daysRemaining === 0) {
    return { label: `Istječe danas (${dateLabel})`, tone: "warning" };
  }

  if (daysRemaining <= 7) {
    const dayNoun = daysRemaining === 1 ? "dan" : "dana";
    return { label: `Istječe za ${daysRemaining} ${dayNoun} (${dateLabel})`, tone: "warning" };
  }

  return { label: `Vrijedi do ${dateLabel}`, tone: "active" };
}

function membershipToneStyle(tone: MembershipTone) {
  switch (tone) {
    case "active":
      return styles.membershipActive;
    case "warning":
      return styles.membershipWarning;
    case "expired":
      return styles.membershipExpired;
    default:
      return styles.membershipUnset;
  }
}

function LabeledInput({
  label,
  ...props
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  keyboardType?: "default" | "email-address" | "url";
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput placeholderTextColor="#7a899a" style={styles.input} {...props} />
    </View>
  );
}

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryPill}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function MessageBanner({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  return (
    <View style={[styles.messageBanner, tone === "success" ? styles.messageSuccess : styles.messageError]}>
      <Text style={styles.messageText}>{message}</Text>
    </View>
  );
}

function PracticeTypePill({ practiceType }: { practiceType: PracticeType }) {
  return (
    <View
      style={[
        styles.practiceTypePill,
        practiceType === "DRYLAND" ? styles.practiceTypeDryland : styles.practiceTypeWater,
      ]}
    >
      <Text style={styles.practiceTypePillText}>
        {practiceType === "DRYLAND" ? "Suhi trening" : "Trening u vodi"}
      </Text>
    </View>
  );
}

async function requestJson<T>(
  apiBaseUrl: string,
  path: string,
  options: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    token?: string;
    body?: string;
  },
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body,
  });

  const responseBody = (await response.json().catch(() => null)) as ApiErrorResponse | T | null;

  if (!response.ok) {
    throw new Error(
      (responseBody as ApiErrorResponse | null)?.message ?? "Zahtjev nije uspio. Pokušajte ponovno.",
    );
  }

  return responseBody as T;
}

function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return defaultApiBaseUrl;
  }

  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function getCurrentDateKey() {
  return formatDateKey(new Date());
}

function getWeekStartDate(value: Date) {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

function getWeekStartKeyForDateKey(dateKey: string) {
  return formatDateKey(getWeekStartDate(new Date(`${dateKey}T00:00:00.000Z`)));
}

function shiftDayKey(dateKey: string, deltaDays: number) {
  const nextDate = new Date(`${dateKey}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + deltaDays);
  return formatDateKey(nextDate);
}

function formatSelectedDayLabel(dateKey: string) {
  return formatLongDate(new Date(`${dateKey}T12:00:00.000Z`));
}

function formatPracticeDate(value: string) {
  return formatLongDate(new Date(`${value}T12:00:00.000Z`));
}

function formatPracticeTime(practice: { startTime: string; endTime: string }) {
  return formatTimeRange(practice.startTime, practice.endTime);
}

function formatTimeRange(startTime: string, endTime: string) {
  return `${formatTimeValue(startTime)} - ${formatTimeValue(endTime)}`;
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat("hr-HR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatDateTimeValue(value: string) {
  return new Intl.DateTimeFormat("hr-HR", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTimeValue(value: string) {
  return new Intl.DateTimeFormat("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateValue(value: string) {
  return new Intl.DateTimeFormat("hr-HR", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3f7fb",
  },
  tabShell: {
    flex: 1,
    backgroundColor: "#f3f7fb",
  },
  tabHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "#d6e0eb",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  tabHeaderBadge: {
    color: "#5f6f82",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  tabHeaderName: {
    marginTop: 6,
    color: "#102347",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  tabHeaderSub: {
    marginTop: 6,
    color: "#5f6f82",
    fontSize: 13,
    lineHeight: 20,
  },
  tabBody: {
    flex: 1,
  },
  tabContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 16,
  },
  tabBar: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderTopColor: "#d6e0eb",
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 18 : 10,
  },
  tabBarItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  tabBarIcon: {
    color: "#7a899a",
    fontSize: 19,
  },
  tabBarIconActive: {
    color: "#123d75",
  },
  tabBarLabel: {
    color: "#7a899a",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  tabBarLabelActive: {
    color: "#123d75",
  },
  screenContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 18,
  },
  heroPanel: {
    borderRadius: 28,
    backgroundColor: "#123d75",
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  heroBadge: {
    color: "#cfe1ff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  heroTitle: {
    marginTop: 12,
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 36,
  },
  heroCopy: {
    marginTop: 12,
    color: "#dbe7f7",
    fontSize: 15,
    lineHeight: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#d6e0eb",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  sectionEyebrow: {
    color: "#5f6f82",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  sectionTitle: {
    marginTop: 8,
    color: "#102347",
    fontSize: 25,
    fontWeight: "700",
    lineHeight: 30,
  },
  sectionCopy: {
    marginTop: 10,
    color: "#5f6f82",
    fontSize: 14,
    lineHeight: 22,
  },
  inputGroup: {
    marginTop: 16,
  },
  inputLabel: {
    marginBottom: 8,
    color: "#405365",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d6e0eb",
    backgroundColor: "#f7fbff",
    color: "#102347",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButton: {
    marginTop: 20,
    minHeight: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#123d75",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d6e0eb",
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: {
    color: "#123d75",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  infoPanel: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: "#f7fbff",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  infoLabel: {
    color: "#5f6f82",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  infoValue: {
    marginTop: 6,
    color: "#102347",
    fontSize: 14,
    lineHeight: 20,
  },
  messageBanner: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  messageSuccess: {
    backgroundColor: "#dff6ea",
  },
  messageError: {
    backgroundColor: "#ffe3e4",
  },
  messageText: {
    color: "#102347",
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
  },
  summaryRow: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryPill: {
    minWidth: 132,
    borderRadius: 18,
    backgroundColor: "#f7fbff",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryLabel: {
    color: "#5f6f82",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  summaryValue: {
    marginTop: 6,
    color: "#102347",
    fontSize: 14,
    fontWeight: "700",
  },
  inlineActions: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  outlineChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c8d6e6",
    backgroundColor: "#f7fbff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  outlineChipText: {
    color: "#123d75",
    fontSize: 13,
    fontWeight: "700",
  },
  loadingBlock: {
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: "#f7fbff",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyStateText: {
    color: "#405365",
    fontSize: 14,
    lineHeight: 22,
  },
  practiceCard: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d6e0eb",
    backgroundColor: "#f9fbfd",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  practiceCardSelected: {
    borderColor: "#123d75",
    backgroundColor: "#eef4fb",
  },
  practiceCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  practiceCardMeta: {
    flex: 1,
    gap: 6,
  },
  practiceCardTitle: {
    color: "#102347",
    fontSize: 18,
    fontWeight: "700",
  },
  practiceCardCopy: {
    color: "#5f6f82",
    fontSize: 14,
    lineHeight: 20,
  },
  practiceCoachText: {
    color: "#405365",
    fontSize: 14,
    lineHeight: 22,
  },
  primaryInlineButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#123d75",
    paddingHorizontal: 16,
  },
  primaryInlineButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  practiceTypePill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  practiceTypeWater: {
    backgroundColor: "#d8ebff",
  },
  practiceTypeDryland: {
    backgroundColor: "#ffe8d5",
  },
  practiceTypePillText: {
    color: "#102347",
    fontSize: 12,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 35, 71, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  modalHeaderCopy: {
    flex: 1,
  },
  modalTitle: {
    marginTop: 8,
    color: "#102347",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  modalSubtitle: {
    marginTop: 10,
    color: "#5f6f82",
    fontSize: 14,
    lineHeight: 22,
  },
  modalCloseButton: {
    borderRadius: 999,
    backgroundColor: "#f3f7fb",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCloseButtonText: {
    color: "#123d75",
    fontSize: 13,
    fontWeight: "700",
  },
  qrCard: {
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  scannerWrap: {
    marginTop: 18,
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "#102347",
  },
  scannerView: {
    height: 340,
    width: "100%",
  },
  scannerOverlay: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#102347",
  },
  scannerOverlayText: {
    color: "#dbe7f7",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  selectedChildBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d6e0eb",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  selectedChildCopy: {
    flex: 1,
  },
  selectedChildLabel: {
    color: "#5f6f82",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  selectedChildName: {
    marginTop: 4,
    color: "#102347",
    fontSize: 17,
    fontWeight: "700",
  },
  changeChildButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c8d6e6",
    backgroundColor: "#f7fbff",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  changeChildButtonText: {
    color: "#123d75",
    fontSize: 13,
    fontWeight: "700",
  },
  childPickerList: {
    marginTop: 18,
    gap: 12,
  },
  childPickerItem: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d6e0eb",
    backgroundColor: "#f9fbfd",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  childPickerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "#123d75",
    alignItems: "center",
    justifyContent: "center",
  },
  childPickerAvatarText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  childPickerMeta: {
    flex: 1,
    gap: 4,
  },
  childPickerName: {
    color: "#102347",
    fontSize: 16,
    fontWeight: "700",
  },
  childPickerCopy: {
    color: "#5f6f82",
    fontSize: 13,
    lineHeight: 18,
  },
  childPickerArrow: {
    color: "#123d75",
    fontSize: 26,
    fontWeight: "700",
  },
  categoryBadgeRow: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryBadge: {
    borderRadius: 999,
    backgroundColor: "#d8ebff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryBadgeText: {
    color: "#102347",
    fontSize: 12,
    fontWeight: "700",
  },
  membershipBadge: {
    marginTop: 16,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  membershipActive: {
    backgroundColor: "#dff6ea",
  },
  membershipWarning: {
    backgroundColor: "#fff1d6",
  },
  membershipExpired: {
    backgroundColor: "#ffe3e4",
  },
  membershipUnset: {
    backgroundColor: "#f7fbff",
  },
  membershipLabel: {
    color: "#5f6f82",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  membershipValue: {
    marginTop: 6,
    color: "#102347",
    fontSize: 16,
    fontWeight: "700",
  },
  scoreRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  scoreValue: {
    color: "#123d75",
    fontSize: 40,
    fontWeight: "700",
  },
  scoreCaption: {
    color: "#5f6f82",
    fontSize: 14,
    fontWeight: "600",
  },
  scoreBar: {
    marginTop: 14,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#e3ecf6",
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#123d75",
  },
  practiceCardCancelled: {
    opacity: 0.7,
    borderColor: "#f3b6b8",
  },
  statusTag: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusTagCancelled: {
    backgroundColor: "#ffe3e4",
  },
  statusTagAttended: {
    backgroundColor: "#dff6ea",
  },
  statusTagText: {
    color: "#102347",
    fontSize: 12,
    fontWeight: "700",
  },
  inboxHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  inboxHeaderCopy: {
    flex: 1,
  },
  inboxBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#e2483d",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  inboxBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  inboxMarkAllButton: {
    marginTop: 16,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c8d6e6",
    backgroundColor: "#f7fbff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inboxMarkAllText: {
    color: "#123d75",
    fontSize: 13,
    fontWeight: "700",
  },
  inboxItem: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d6e0eb",
    backgroundColor: "#f9fbfd",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  inboxItemUnread: {
    borderColor: "#123d75",
    backgroundColor: "#eef4fb",
  },
  inboxItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  inboxItemTitle: {
    flex: 1,
    color: "#102347",
    fontSize: 16,
    fontWeight: "700",
  },
  inboxUnreadDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#e2483d",
  },
  inboxItemBody: {
    color: "#405365",
    fontSize: 14,
    lineHeight: 22,
  },
  inboxItemMeta: {
    color: "#7a899a",
    fontSize: 12,
    fontWeight: "600",
  },
  leaderboardChipRow: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  leaderboardChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c8d6e6",
    backgroundColor: "#f7fbff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  leaderboardChipSelected: {
    borderColor: "#123d75",
    backgroundColor: "#123d75",
  },
  leaderboardChipText: {
    color: "#123d75",
    fontSize: 13,
    fontWeight: "700",
  },
  leaderboardChipTextSelected: {
    color: "#ffffff",
  },
  leaderboardRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d6e0eb",
    backgroundColor: "#f9fbfd",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  leaderboardRowHighlighted: {
    borderColor: "#123d75",
    backgroundColor: "#eef4fb",
  },
  leaderboardRank: {
    minWidth: 34,
    alignItems: "center",
  },
  leaderboardRankText: {
    color: "#102347",
    fontSize: 18,
    fontWeight: "700",
  },
  leaderboardRowMeta: {
    flex: 1,
    gap: 4,
  },
  leaderboardRowName: {
    color: "#102347",
    fontSize: 15,
    fontWeight: "700",
  },
  leaderboardRowCopy: {
    color: "#5f6f82",
    fontSize: 13,
  },
  leaderboardPercentPill: {
    borderRadius: 999,
    backgroundColor: "#d8ebff",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  leaderboardPercentText: {
    color: "#102347",
    fontSize: 13,
    fontWeight: "700",
  },
  leaderboardPagination: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  leaderboardPaginationText: {
    color: "#5f6f82",
    fontSize: 13,
    fontWeight: "700",
  },
  paginationButtonDisabled: {
    opacity: 0.45,
  },
  leaderboardEllipsis: {
    marginTop: 8,
    textAlign: "center",
    color: "#7a899a",
    fontSize: 18,
    fontWeight: "700",
  },
});
