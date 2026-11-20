import { C, PHONE_MQ, fontDisplay } from "../ui/theme.js";

export const filesStyles = `
  .nx-files-screen {
    --files-thumb-w: 68px;
    --files-thumb-h: 46px;
    --files-row-pad: 15px;
    --files-row-gap: 18px;
  }
  .nx-files-screen .ng-crumbs > button {
    clip-path: polygon(26px 0, 100% 0, calc(100% - 26px) 100%, 0 100%) !important;
    padding-inline: 34px !important;
  }
  .nx-files-screen .ng-crumbs > button + button { margin-left: -10px; }
  .nx-files-screen .ng-crumbs > button:nth-child(3n+2) {
    background: linear-gradient(110deg, ${C.foldDeep}, ${C.foldGreen}) !important;
  }
  .nx-files-screen .ng-crumbs > button:focus-visible { text-decoration: underline; }
  .nx-files-track {
    position: relative;
    height: 2px;
    margin-top: 16px;
    background: ${C.border};
  }
  .nx-files-caption {
    min-width: 0;
    margin: 0;
    font: 400 18px/1.3 ${fontDisplay};
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }
  .nx-files-tools { padding-block: 14px; }
  .nx-files-tools .nx-files-actions { flex-wrap: wrap; }
  .nx-files-screen .nx-files-list {
    scrollbar-width: thin;
    scrollbar-color: ${C.borderStrong} transparent;
  }
  .nx-files-screen .nx-files-list > .nx-row-btn > :first-child,
  .nx-files-screen .nx-files-list > form > :first-child {
    width: var(--files-thumb-w) !important;
    height: var(--files-thumb-h) !important;
  }
  .nx-files-screen .nx-files-list > .nx-row-btn { overflow-wrap: anywhere; }
  @media (hover: hover) and (pointer: fine) {
    .nx-files-screen .nx-file-row:not(:hover):not(:focus-within) .nx-transfer-btn { opacity: 0; }
  }
  @media ${PHONE_MQ} {
    .nx-files-screen {
      --files-thumb-w: 54px;
      --files-thumb-h: 38px;
      --files-row-pad: 12px;
      --files-row-gap: 12px;
    }
    .nx-files-screen .ng-crumbs > button { padding-inline: 26px !important; }
  }
`;
