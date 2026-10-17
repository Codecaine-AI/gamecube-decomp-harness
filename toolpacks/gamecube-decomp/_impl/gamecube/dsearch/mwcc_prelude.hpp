/*
 * Declarations of MWCC PowerPC intrinsics that clang does not know, injected
 * (with -include) only into typeidx's C++ record-layout dump compile; never
 * into game files. Function bodies that call them then parse, so clang emits
 * every layout it can. Declarations only: no layout depends on them.
 */
extern "C" {
int __cntlzw(unsigned int);
unsigned int __lwbrx(void*, int);
unsigned short __lhbrx(void*, int);
void __stwbrx(unsigned int, void*, int);
void __sthbrx(unsigned short, void*, int);
double __fabs(double);
float __fabsf(float);
double __fnabs(double);
double __frsqrte(double);
float __fres(float);
double __fsel(double, double, double);
int __rlwinm(int, int, int, int);
int __rlwimi(int, int, int, int, int);
int __rlwnm(int, int, int, int);
int __mulhw(int, int);
unsigned int __mulhwu(unsigned int, unsigned int);
void __dcbf(void*, int);
void __dcbst(void*, int);
void __dcbt(void*, int);
void __dcbi(void*, int);
void __dcbz(void*, int);
void __sync(void);
void __isync(void);
void __eieio(void);
}
