// Export every reference in the current program as JSON Lines.
// @category GameCube Decomp

import java.io.BufferedWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionManager;
import ghidra.program.model.symbol.RefType;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.ReferenceManager;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolTable;

public class ExportXrefs extends GhidraScript {

	private static final char[] HEX = "0123456789abcdef".toCharArray();

	@Override
	protected void run() throws Exception {
		String[] scriptArgs = getScriptArgs();
		if (scriptArgs.length < 1) {
			throw new IllegalArgumentException("ExportXrefs.java requires an output path argument");
		}

		Path outputPath = Paths.get(scriptArgs[0]);
		ReferenceManager referenceManager = currentProgram.getReferenceManager();
		FunctionManager functionManager = currentProgram.getFunctionManager();
		SymbolTable symbolTable = currentProgram.getSymbolTable();
		ReferenceIterator references =
			referenceManager.getReferenceIterator(currentProgram.getMinAddress());
		int count = 0;

		try (BufferedWriter output =
			Files.newBufferedWriter(outputPath, StandardCharsets.UTF_8)) {
			while (references.hasNext()) {
				Reference reference = references.next();
				Address from = reference.getFromAddress();
				Address to = reference.getToAddress();
				String fromAddress = addressText(from);
				String toAddress = addressText(to);
				RefType referenceType = reference.getReferenceType();
				String referenceTypeText = referenceType.toString();
				String fromSymbol = fromSymbolName(functionManager, symbolTable, from);
				String toSymbol = toSymbolName(functionManager, symbolTable, to);
				String text = valueOrEmpty(fromSymbol) + " " + referenceTypeText + " " +
					valueOrEmpty(toSymbol) + " " + fromAddress + " " + toAddress;

				output.write(jsonRow(fromAddress, toAddress, referenceTypeText,
					referenceType.isCall(), referenceType.isData(), fromSymbol, toSymbol, text));
				output.newLine();
				count++;
			}
		}

		println("EXPORT_XREFS_SUMMARY count=" + count + " output=" + outputPath);
	}

	private static String addressText(Address address) {
		return "0x" + address;
	}

	private static String primarySymbolName(SymbolTable symbolTable, Address address) {
		Symbol symbol = symbolTable.getPrimarySymbol(address);
		return symbol == null ? null : symbol.getName();
	}

	private static String fromSymbolName(FunctionManager functionManager,
			SymbolTable symbolTable, Address address) {
		Function function = functionManager.getFunctionContaining(address);
		return function == null ? primarySymbolName(symbolTable, address) : function.getName();
	}

	private static String toSymbolName(FunctionManager functionManager,
			SymbolTable symbolTable, Address address) {
		Function function = functionManager.getFunctionAt(address);
		return function == null ? primarySymbolName(symbolTable, address) : function.getName();
	}

	private static String valueOrEmpty(String value) {
		return value == null ? "" : value;
	}

	private static String jsonRow(String fromAddress, String toAddress, String referenceType,
			boolean isCall, boolean isData, String fromSymbol, String toSymbol, String text) {
		StringBuilder row = new StringBuilder(256);
		row.append("{\"from_address\": ").append(jsonString(fromAddress));
		row.append(", \"from_symbol\": ").append(jsonString(fromSymbol));
		row.append(", \"id\": ").append(jsonString("xref:" + fromAddress + ":" + toAddress));
		row.append(", \"is_call\": ").append(isCall);
		row.append(", \"is_data\": ").append(isData);
		row.append(", \"kind\": \"ghidra_xref\"");
		row.append(", \"ref_type\": ").append(jsonString(referenceType));
		row.append(", \"text\": ").append(jsonString(text));
		row.append(", \"to_address\": ").append(jsonString(toAddress));
		row.append(", \"to_symbol\": ").append(jsonString(toSymbol));
		row.append('}');
		return row.toString();
	}

	private static String jsonString(String value) {
		if (value == null) {
			return "null";
		}

		StringBuilder escaped = new StringBuilder(value.length() + 2);
		escaped.append('\"');
		for (int index = 0; index < value.length(); index++) {
			char character = value.charAt(index);
			switch (character) {
				case '\"':
					escaped.append("\\\"");
					break;
				case '\\':
					escaped.append("\\\\");
					break;
				case '\b':
					escaped.append("\\b");
					break;
				case '\f':
					escaped.append("\\f");
					break;
				case '\n':
					escaped.append("\\n");
					break;
				case '\r':
					escaped.append("\\r");
					break;
				case '\t':
					escaped.append("\\t");
					break;
				default:
					if (character < 0x20 || character > 0x7e) {
						escaped.append("\\u");
						escaped.append(HEX[(character >>> 12) & 0xf]);
						escaped.append(HEX[(character >>> 8) & 0xf]);
						escaped.append(HEX[(character >>> 4) & 0xf]);
						escaped.append(HEX[character & 0xf]);
					}
					else {
						escaped.append(character);
					}
			}
		}
		escaped.append('\"');
		return escaped.toString();
	}
}
