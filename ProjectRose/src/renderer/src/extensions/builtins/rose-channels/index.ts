// rose-channels — fifth built-in extension (ADR 0015).
//
// Event-triggered sibling of rose-routines. Where Routines fire the Agent on
// a clock, Channel Rules fire the Agent when a message arrives on Discord,
// Slack, or email — using the same Detached Run with tools primitive.

export { manifest } from './manifest'
export { ChannelsPage as PageView } from './ChannelsPage'
export { ChannelsSettings as SettingsView } from './ChannelsSettings'
