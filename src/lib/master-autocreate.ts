// Shared master auto-create wrapper.
// Re-exports the Defect ensurer under a generic name so other import flows
// (ABD, OMM, future Warranty) can register new HDEC PIC / HDEC ENG names
// without depending on the Defect-specific module path.
export {
  createDefectMasterEnsurer as createMasterEnsurer,
  type DefectMasterRowInput as MasterRowInput,
  type DefectMasterEnsurer as MasterEnsurer,
} from './defect-master-autocreate';
