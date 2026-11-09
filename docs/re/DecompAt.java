// Decompiles the functions at the given addresses into C:/gh12s/out-<addr>.c, following switch tables.
import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.app.cmd.function.DecompilerSwitchAnalysisCmd;
import ghidra.app.decompiler.*;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import java.io.PrintWriter;

public class DecompAt extends GhidraScript {
  @Override
  public void run() throws Exception {
    DecompInterface d = new DecompInterface();
    d.openProgram(currentProgram);
    for (String hex : getScriptArgs()) {
      Address a = toAddr(Long.parseUnsignedLong(hex, 16));
      disassemble(a);
      Function f = getFunctionAt(a);
      if (f == null) f = createFunction(a, "m_" + hex);
      try (PrintWriter w = new PrintWriter("C:/gh12s/out-" + hex + ".c", "UTF-8")) {
        if (f == null) { w.println("no function at " + hex); continue; }
        DecompileResults r = null;
        for (int pass = 0; pass < 6; pass++) {
          r = d.decompileFunction(f, 300, monitor);
          if (!r.decompileCompleted()) break;
          long before = f.getBody().getNumAddresses();
          new DecompilerSwitchAnalysisCmd(r).applyTo(currentProgram, monitor);
          // Disassemble only the switch targets, instead of running auto-analysis over the whole file.
          for (ghidra.program.model.listing.Instruction ins : currentProgram.getListing().getInstructions(f.getBody(), true))
            for (ghidra.program.model.symbol.Reference ref : ins.getReferencesFrom())
              if (ref.getReferenceType().isComputed() || ref.getReferenceType().isJump()) disassemble(ref.getToAddress());
          CreateFunctionCmd.fixupFunctionBody(currentProgram, currentProgram.getListing().getInstructionAt(a), monitor);
          if (f.getBody().getNumAddresses() == before) break;
        }
        w.println("// " + f.getName() + " entry " + f.getEntryPoint() + " size " + f.getBody().getNumAddresses());
        w.println(r != null && r.decompileCompleted() ? r.getDecompiledFunction().getC() : "failed: " + (r == null ? "" : r.getErrorMessage()));
      }
      println("done " + hex);
    }
    d.dispose();
  }
}
