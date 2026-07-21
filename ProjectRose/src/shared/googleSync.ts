// Result shape shared by every Google sync apply step (Contacts pull/push,
// Calendar pull/push, event invites).

export interface GoogleApplyResult {
  appliedAt: number
  ok: boolean
  message: string
}
