/* ir_oracle_prelude.h -- force-included (`-include`) by ir_oracle.py.
 *
 * SMS code is written for MWCC, which provides PowerPC intrinsics as compiler
 * builtins. Clang (`-nostdinc -fno-builtin`, `--target=powerpc-eabi`) knows
 * none of them, so each one is renamed onto an opaque declaration here. Pure
 * ones are `__ir_oracle_pure_*` with `__attribute__((const))`, so the oracle
 * treats their calls as values; the rest stay ordinary (side-effecting) calls.
 *
 * Renaming via macros keeps later redeclarations (e.g. MSL math.h's
 * `double __frsqrte(double);` inside `extern "C"`) compatible: they turn into
 * redeclarations of the same `extern "C"` function.
 *
 * `__LINE__` is pinned to 0: asserts and panics embed it, and a steering edit
 * that adds or removes a line must not change the IR of unrelated code. MWCC
 * output is still checked separately by the real build.
 */
#ifndef IR_ORACLE_PRELUDE_H
#define IR_ORACLE_PRELUDE_H

#undef __LINE__
#define __LINE__ 0

#ifdef __cplusplus
extern "C" {
#endif

double __ir_oracle_pure_frsqrte(double) __attribute__((const));
float __ir_oracle_pure_fres(float) __attribute__((const));
double __ir_oracle_pure_fabs(double) __attribute__((const));
float __ir_oracle_pure_fabsf(float) __attribute__((const));
double __ir_oracle_pure_fnabs(double) __attribute__((const));
float __ir_oracle_pure_fnabsf(float) __attribute__((const));
double __ir_oracle_pure_fsel(double, double, double) __attribute__((const));
float __ir_oracle_pure_fsels(float, float, float) __attribute__((const));
int __ir_oracle_pure_rlwimi(int, int, int, int, int) __attribute__((const));
int __ir_oracle_pure_rlwinm(int, int, int, int) __attribute__((const));
int __ir_oracle_pure_abs(int) __attribute__((const));
double __ir_oracle_pure_fmadd(double, double, double) __attribute__((const));
double __ir_oracle_pure_fmsub(double, double, double) __attribute__((const));
double __ir_oracle_pure_fnmadd(double, double, double) __attribute__((const));
double __ir_oracle_pure_fnmsub(double, double, double) __attribute__((const));
float __ir_oracle_pure_fmadds(float, float, float) __attribute__((const));
float __ir_oracle_pure_frsp(double) __attribute__((const));

unsigned short __ir_oracle_lhbrx(const void*, int);
unsigned int __ir_oracle_lwbrx(const void*, int);
void __ir_oracle_sthbrx(unsigned short, void*, int);
void __ir_oracle_stwbrx(unsigned int, void*, int);
void __ir_oracle_dcbz(void*, int);
void __ir_oracle_dcbf(void*, int);
void __ir_oracle_dcbst(void*, int);
void __ir_oracle_dcbi(void*, int);
void __ir_oracle_dcbt(void*, int);
void __ir_oracle_icbi(void*, int);
void __ir_oracle_sync(void);
void __ir_oracle_isync(void);
void __ir_oracle_eieio(void);
unsigned int __ir_oracle_mftb(void);
unsigned int __ir_oracle_mfspr(int);
void __ir_oracle_mtspr(int, unsigned int);

#ifdef __cplusplus
}
#endif

#define __frsqrte __ir_oracle_pure_frsqrte
#define __fres __ir_oracle_pure_fres
#define __fabs __ir_oracle_pure_fabs
#define __fabsf __ir_oracle_pure_fabsf
#define __fnabs __ir_oracle_pure_fnabs
#define __fnabsf __ir_oracle_pure_fnabsf
#define __fsel __ir_oracle_pure_fsel
#define __fsels __ir_oracle_pure_fsels
#define __rlwimi __ir_oracle_pure_rlwimi
#define __rlwinm __ir_oracle_pure_rlwinm
#define __abs __ir_oracle_pure_abs
#define __fmadd __ir_oracle_pure_fmadd
#define __fmsub __ir_oracle_pure_fmsub
#define __fnmadd __ir_oracle_pure_fnmadd
#define __fnmsub __ir_oracle_pure_fnmsub
#define __fmadds __ir_oracle_pure_fmadds
#define __frsp __ir_oracle_pure_frsp

#define __lhbrx __ir_oracle_lhbrx
#define __lwbrx __ir_oracle_lwbrx
#define __sthbrx __ir_oracle_sthbrx
#define __stwbrx __ir_oracle_stwbrx
#define __dcbz __ir_oracle_dcbz
#define __dcbf __ir_oracle_dcbf
#define __dcbst __ir_oracle_dcbst
#define __dcbi __ir_oracle_dcbi
#define __dcbt __ir_oracle_dcbt
#define __icbi __ir_oracle_icbi
#define __sync __ir_oracle_sync
#define __isync __ir_oracle_isync
#define __eieio __ir_oracle_eieio
#define __mftb __ir_oracle_mftb
#define __mfspr __ir_oracle_mfspr
#define __mtspr __ir_oracle_mtspr

#endif /* IR_ORACLE_PRELUDE_H */
