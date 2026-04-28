import { useEffect, useState } from "react";
import { Check, KeyRound, Mail, ShieldCheck, Users } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "../components/ui/pagination";
import { type AuthUser } from "../services/auth/authUser";
import {
  APP_MENU_LABELS,
  approveAccessRequest,
  type EmailDeliveryResult,
  getAdminState,
  updateLocalUser,
  type AdminState,
  type AppMenuKey
} from "../services/auth/localAuth";

type AdminPanelProps = {
  authUser: AuthUser;
};

const menuOptions: AppMenuKey[] = ["dashboard-cpac", "dashboard-qmix", "admin"];
const DEFAULT_ADMIN_EMAIL = "admin@admin.com";
const ADMIN_TABLE_PAGE_SIZE = 15;
const ALL_MENU_OPTIONS: AppMenuKey[] = [...menuOptions];

function toggleMenu(current: AppMenuKey[], menu: AppMenuKey) {
  return current.includes(menu) ? current.filter((item) => item !== menu) : [...current, menu];
}

function getMenuPermissionsForRole(role: "admin" | "user", current: AppMenuKey[], fallback: AppMenuKey) {
  if (role === "admin") {
    return ALL_MENU_OPTIONS;
  }

  return current.length > 0 ? current : [fallback];
}

function formatAdminDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatEmailDeliveryMessage(result: EmailDeliveryResult) {
  if (result.delivered) {
    return "อนุมัติแล้วและส่งอีเมลออกสำเร็จ";
  }

  if (result.queued) {
    return result.reason ?? "อนุมัติแล้ว ระบบกำลังตรวจสอบการส่งอีเมล";
  }

  if (result.provider === "none") {
    return "อนุมัติแล้ว แต่ยังไม่มี email provider ระบบเลยเก็บข้อความไว้ใน outbox";
  }

  return `อนุมัติแล้ว แต่ส่งอีเมลไม่สำเร็จ${result.reason ? `: ${result.reason}` : ""}`;
}

function isPositiveEmailDeliveryResult(result: EmailDeliveryResult) {
  return result.delivered || result.queued;
}

function formatDeliveryBadge(status: "pending" | "sent" | "failed" | "skipped") {
  if (status === "sent") {
    return "ส่งแล้ว";
  }
  if (status === "failed") {
    return "ส่งไม่สำเร็จ";
  }
  if (status === "skipped") {
    return "ยังไม่ได้ส่ง";
  }
  return "รอผลการส่ง";
}

function getAdminPaginationItems(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right)
    .flatMap((page, index, sortedPages) => {
      const previousPage = sortedPages[index - 1];
      return previousPage && page - previousPage > 1 ? ["ellipsis", page] : [page];
    });
}

export function AdminPanel({ authUser }: AdminPanelProps) {
  const [adminState, setAdminState] = useState<AdminState>({
    users: [],
    requests: [],
    outbox: []
  });
  const [isLoadingAdminState, setIsLoadingAdminState] = useState(true);
  const [approvalRoleById, setApprovalRoleById] = useState<Record<string, "admin" | "user">>({});
  const [approvalMenusById, setApprovalMenusById] = useState<Record<string, AppMenuKey[]>>({});
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [currentRequestPage, setCurrentRequestPage] = useState(1);
  const [currentUserPage, setCurrentUserPage] = useState(1);
  const [submittingRequestId, setSubmittingRequestId] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState("");
  const [copiedEmailId, setCopiedEmailId] = useState("");

  const requests = adminState.requests;
  const users = adminState.users;
  const outbox = adminState.outbox;
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const adminCount = users.filter((user) => user.role === "admin").length;
  const requestTotalPages = Math.max(1, Math.ceil(pendingRequests.length / ADMIN_TABLE_PAGE_SIZE));
  const resolvedRequestPage = Math.min(currentRequestPage, requestTotalPages);
  const firstRequestIndex =
    pendingRequests.length === 0 ? 0 : (resolvedRequestPage - 1) * ADMIN_TABLE_PAGE_SIZE + 1;
  const lastRequestIndex = Math.min(resolvedRequestPage * ADMIN_TABLE_PAGE_SIZE, pendingRequests.length);
  const visibleRequests = pendingRequests.slice(firstRequestIndex - 1, lastRequestIndex);
  const requestPaginationItems = getAdminPaginationItems(resolvedRequestPage, requestTotalPages);
  const userTotalPages = Math.max(1, Math.ceil(users.length / ADMIN_TABLE_PAGE_SIZE));
  const resolvedUserPage = Math.min(currentUserPage, userTotalPages);
  const firstUserIndex = users.length === 0 ? 0 : (resolvedUserPage - 1) * ADMIN_TABLE_PAGE_SIZE + 1;
  const lastUserIndex = Math.min(resolvedUserPage * ADMIN_TABLE_PAGE_SIZE, users.length);
  const visibleUsers = users.slice(firstUserIndex - 1, lastUserIndex);
  const userPaginationItems = getAdminPaginationItems(resolvedUserPage, userTotalPages);

  const forceRefresh = async () => {
    setIsLoadingAdminState(true);
    try {
      setAdminState(await getAdminState());
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "โหลดข้อมูล admin ไม่สำเร็จ");
    } finally {
      setIsLoadingAdminState(false);
    }
  };

  useEffect(() => {
    void forceRefresh();
  }, []);

  const handleApprove = async (requestId: string, company: "CPAC" | "QMIX") => {
    const defaultMenu: AppMenuKey = company === "QMIX" ? "dashboard-qmix" : "dashboard-cpac";
    const selectedRole = approvalRoleById[requestId] ?? "user";
    const menuPermissions = getMenuPermissionsForRole(
      selectedRole,
      approvalMenusById[requestId] ?? [],
      defaultMenu
    );

    setSubmittingRequestId(requestId);
    try {
      const result = await approveAccessRequest(requestId, {
        role: selectedRole,
        menuPermissions
      });

      setAdminState((current) => {
        const nextUsers = [...current.users];
        const existingIndex = nextUsers.findIndex((user) => user.id === result.user.id);
        if (existingIndex >= 0) {
          nextUsers[existingIndex] = result.user;
        } else {
          nextUsers.push(result.user);
        }

        return {
          ...current,
          users: nextUsers,
          requests: current.requests.filter((request) => request.id !== requestId)
        };
      });
      setMessageTone(isPositiveEmailDeliveryResult(result.emailDelivery) ? "success" : "error");
      setMessage(formatEmailDeliveryMessage(result.emailDelivery));
      void forceRefresh();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "อนุมัติผู้ใช้งานไม่สำเร็จ");
    } finally {
      setSubmittingRequestId("");
    }
  };

  const handleUserRoleChange = async (userId: string, role: "admin" | "user") => {
    const user = users.find((candidate) => candidate.id === userId);
    if (!user || updatingUserId === userId) {
      return;
    }

    setUpdatingUserId(userId);
    try {
      const updatedUser = await updateLocalUser(userId, {
        role,
        menuPermissions: role === "admin" ? ALL_MENU_OPTIONS : user.menuPermissions
      });
      setAdminState((current) => ({
        ...current,
        users: current.users.map((candidate) => (candidate.id === userId ? updatedUser : candidate))
      }));
      setMessageTone("success");
      setMessage("อัปเดต role แล้ว");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "อัปเดต role ไม่สำเร็จ");
    } finally {
      setUpdatingUserId("");
    }
  };

  const handleUserMenuToggle = async (userId: string, menu: AppMenuKey) => {
    const user = users.find((candidate) => candidate.id === userId);
    if (!user || updatingUserId === userId) {
      return;
    }

    setUpdatingUserId(userId);
    try {
      const updatedUser = await updateLocalUser(userId, {
        role: user.role,
        menuPermissions: toggleMenu(user.menuPermissions, menu)
      });
      setAdminState((current) => ({
        ...current,
        users: current.users.map((candidate) => (candidate.id === userId ? updatedUser : candidate))
      }));
      setMessageTone("success");
      setMessage("อัปเดตเมนูที่ user เห็นได้แล้ว");
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "อัปเดตเมนูไม่สำเร็จ");
    } finally {
      setUpdatingUserId("");
    }
  };

  const handleCopyEmailBody = async (emailId: string, body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      setCopiedEmailId(emailId);
      setMessageTone("success");
      setMessage("คัดลอกข้อความอีเมลพร้อมรหัสผ่านแล้ว ส่งต่อให้ผู้ใช้งานได้เลย");
      window.setTimeout(() => {
        setCopiedEmailId((current) => (current === emailId ? "" : current));
      }, 2500);
    } catch {
      setMessageTone("error");
      setMessage("คัดลอกข้อความอีเมลไม่สำเร็จ ลองคัดลอกจาก outbox ด้วยตัวเองอีกครั้ง");
    }
  };

  if (authUser.role !== "admin") {
    return (
      <main className="shell">
        <section className="panel adminPanel">
          <h1>Admin</h1>
          <p>บัญชีนี้ไม่มีสิทธิ์เข้าหน้า admin</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell adminShell">
      <section className="panel adminPanel">
        <div className="adminHeader">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>อนุมัติผู้ใช้งานและกำหนดเมนู</h1>
            <p>ตรวจคำขอ สร้างรหัสผ่านให้ผู้ใช้ และกำหนดสิทธิ์เมนูของแต่ละบัญชี</p>
          </div>
          <span>{pendingRequests.length} คำขอรออนุมัติ</span>
        </div>
        {message ? (
          <p className={`adminMessage ${messageTone === "error" ? "error" : "success"}`}>{message}</p>
        ) : null}

        <div className="adminStats">
          <article>
            <Mail />
            <span>คำขอรออนุมัติ</span>
            <strong>{pendingRequests.length}</strong>
          </article>
          <article>
            <Users />
            <span>ผู้ใช้งานทั้งหมด</span>
            <strong>{users.length}</strong>
          </article>
          <article>
            <ShieldCheck />
            <span>Admin</span>
            <strong>{adminCount}</strong>
          </article>
          <article>
            <KeyRound />
            <span>Email outbox</span>
            <strong>{outbox.length}</strong>
          </article>
        </div>

        {isLoadingAdminState ? <p className="tableRefreshNotice">กำลังโหลดข้อมูลจากฐานข้อมูล...</p> : null}

        <div className="adminRequestsLayout">
          <section className="adminSection">
            <div className="adminSectionHeader">
              <div>
                <h2>คำขอเข้าใช้งาน</h2>
                <p>เลือก role และเมนูที่เห็นได้ จากนั้นระบบจะสร้างรหัสผ่านและส่งให้ user อัตโนมัติ</p>
              </div>
            </div>
            {pendingRequests.length === 0 ? (
              <div className="adminEmptyState">
                <Check />
                <strong>ไม่มีคำขอใหม่</strong>
                <span>เมื่อมีคนขอสิทธิ์เข้าใช้งาน รายการจะมาอยู่ตรงนี้</span>
              </div>
            ) : null}
            {visibleRequests.map((request) => {
              const selectedRole = approvalRoleById[request.id] ?? "user";
              const defaultMenu: AppMenuKey =
                request.company === "QMIX" ? "dashboard-qmix" : "dashboard-cpac";
              const selectedMenus = getMenuPermissionsForRole(
                selectedRole,
                approvalMenusById[request.id] ?? [],
                defaultMenu
              );

              return (
                <div key={request.id} className="adminRequestCard">
                  <div className="adminCardTop">
                    <div className="adminAvatar">{request.company === "QMIX" ? "Q" : "C"}</div>
                    <div className="adminCardIdentity">
                      <strong>{request.name}</strong>
                      <span>{request.email}</span>
                      <small>ส่งคำขอ {formatAdminDate(request.createdAt)}</small>
                    </div>
                    <span className="adminCompanyPill">{request.company}</span>
                  </div>

                  <div className="adminNoticeBox">
                    ระบบจะสร้างรหัสผ่านและส่งให้ <strong>{request.email}</strong> หลังจากอนุมัติ
                  </div>

                  <div className="adminFormGrid">
                    <label>
                      Role
                      <select
                        value={selectedRole}
                        disabled={submittingRequestId === request.id}
                        onChange={(event) =>
                          setApprovalRoleById((current) => {
                            const nextRole = event.target.value as "admin" | "user";
                            setApprovalMenusById((menus) => ({
                              ...menus,
                              [request.id]: getMenuPermissionsForRole(
                                nextRole,
                                menus[request.id] ?? [],
                                defaultMenu
                              )
                            }));

                            return {
                              ...current,
                              [request.id]: nextRole
                            };
                          })
                        }
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                  </div>

                  <div className="adminMenuChecks adminPermissionChips" aria-label="เมนูที่เห็นได้">
                    {menuOptions.map((menu) => (
                      <label key={menu}>
                        <input
                          type="checkbox"
                          checked={selectedMenus.includes(menu)}
                          disabled={submittingRequestId === request.id || selectedRole === "admin"}
                          onChange={() =>
                            setApprovalMenusById((current) => ({
                              ...current,
                              [request.id]: toggleMenu(selectedMenus, menu)
                            }))
                          }
                        />
                        <span>{APP_MENU_LABELS[menu]}</span>
                      </label>
                    ))}
                  </div>

                  <div className="adminCardActions">
                    <button
                      type="button"
                      className="authLoginButton adminApproveButton"
                      disabled={submittingRequestId === request.id}
                      onClick={() => void handleApprove(request.id, request.company)}
                    >
                      {submittingRequestId === request.id ? "กำลังอนุมัติ..." : "อนุมัติและส่งอีเมล"}
                    </button>
                  </div>
                </div>
              );
            })}
            {pendingRequests.length > ADMIN_TABLE_PAGE_SIZE ? (
              <div className="adminUserPagination paginationBar">
                <span className="paginationSummary">
                  แสดง {firstRequestIndex}-{lastRequestIndex} จาก {pendingRequests.length} คำขอ
                </span>
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        type="button"
                        disabled={resolvedRequestPage === 1}
                        onClick={() => setCurrentRequestPage((page) => Math.max(1, page - 1))}
                      />
                    </PaginationItem>
                    {requestPaginationItems.map((item, index) => (
                      <PaginationItem key={typeof item === "number" ? item : `request-ellipsis-${index}`}>
                        {item === "ellipsis" ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink
                            type="button"
                            isActive={resolvedRequestPage === item}
                            onClick={() => setCurrentRequestPage(item)}
                          >
                            {item}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        type="button"
                        disabled={resolvedRequestPage === requestTotalPages}
                        onClick={() => setCurrentRequestPage((page) => Math.min(requestTotalPages, page + 1))}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            ) : null}
          </section>
        </div>
      </section>

      <section className="panel adminPanel">
        <div className="adminHeader">
          <div>
            <p className="eyebrow">Users</p>
            <h2>ผู้ใช้งานทั้งหมด</h2>
            <p>แก้ role และเมนูที่ user เห็นได้ทันทีจากตารางนี้</p>
          </div>
          <span>{users.length} users</span>
        </div>

        <div className="adminUserTableWrap">
          <table className="adminUserTable">
            <thead>
              <tr>
                <th>User</th>
                <th>บริษัท</th>
                <th>Role</th>
                <th>เมนูที่เห็นได้</th>
                <th>อัปเดตล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="adminTableUser">
                      <div className="adminAvatar">{user.company === "QMIX" ? "Q" : "C"}</div>
                      <div className="adminCardIdentity">
                        <strong>{user.name}</strong>
                        <span>{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="adminCompanyPill">{user.company}</span>
                  </td>
                  <td>
                    <select
                      value={user.role}
                            disabled={
                              user.id === "admin-local" ||
                              user.email === DEFAULT_ADMIN_EMAIL ||
                              updatingUserId === user.id
                            }
                      onChange={(event) =>
                        handleUserRoleChange(user.id, event.target.value as "admin" | "user")
                      }
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <div className="adminMenuChecks adminPermissionChips compact tableChips">
                      {menuOptions.map((menu) => (
                        <label key={menu}>
                          <input
                            type="checkbox"
                            checked={user.role === "admin" ? ALL_MENU_OPTIONS.includes(menu) : user.menuPermissions.includes(menu)}
                            disabled={
                              user.id === "admin-local" ||
                              user.email === DEFAULT_ADMIN_EMAIL ||
                              updatingUserId === user.id ||
                              user.role === "admin"
                            }
                            onChange={() => handleUserMenuToggle(user.id, menu)}
                          />
                          <span>{APP_MENU_LABELS[menu]}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>{formatAdminDate(user.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length > ADMIN_TABLE_PAGE_SIZE ? (
          <div className="adminUserPagination paginationBar">
            <span className="paginationSummary">
              แสดง {firstUserIndex}-{lastUserIndex} จาก {users.length} users
            </span>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    type="button"
                    disabled={resolvedUserPage === 1}
                    onClick={() => setCurrentUserPage((page) => Math.max(1, page - 1))}
                  />
                </PaginationItem>
                {userPaginationItems.map((item, index) => (
                  <PaginationItem key={typeof item === "number" ? item : `user-ellipsis-${index}`}>
                    {item === "ellipsis" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        type="button"
                        isActive={resolvedUserPage === item}
                        onClick={() => setCurrentUserPage(item)}
                      >
                        {item}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    type="button"
                    disabled={resolvedUserPage === userTotalPages}
                    onClick={() => setCurrentUserPage((page) => Math.min(userTotalPages, page + 1))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </section>

      <section className="panel adminPanel">
        <div className="adminHeader">
          <div>
            <p className="eyebrow">Email outbox</p>
            <h2>อีเมลที่ระบบเตรียมส่ง</h2>
            <p>ใช้สำหรับคัดลอกข้อความพร้อมรหัสผ่านไปส่งต่อให้ผู้ใช้ เมื่ออีเมลอัตโนมัติยังส่งตรงไม่ได้</p>
          </div>
          <span>{outbox.length} ฉบับ</span>
        </div>
        {outbox.length === 0 ? <p className="adminEmpty">ยังไม่มีอีเมล</p> : null}
        <div className="adminOutbox">
          {outbox.map((email) => (
            <article key={email.id} className="adminEmailCard">
              <div className="adminCardTop">
                <div className="adminAvatar mail"><Mail /></div>
                <div className="adminCardIdentity">
                  <strong>{email.to}</strong>
                  <span>{email.subject}</span>
                  <small>{formatAdminDate(email.createdAt)}</small>
                </div>
                <span className="adminCompanyPill">{formatDeliveryBadge(email.deliveryStatus)}</span>
              </div>
              <div className="adminCardActions">
                <button
                  type="button"
                  className="adminSecondaryButton"
                  onClick={() => void handleCopyEmailBody(email.id, email.body)}
                >
                  {copiedEmailId === email.id ? "คัดลอกแล้ว" : "คัดลอกข้อความอีเมล"}
                </button>
              </div>
              {email.deliveryError ? <p className="adminMessage error">{email.deliveryError}</p> : null}
              <pre>{email.body}</pre>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
