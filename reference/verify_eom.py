# Symbolic check: Newton's law for a point mass on y=f(x) with Coulomb friction, base accel ag (1D)
import sympy as sp
x, xd, xdd, ag, g, mu, N, m = sp.symbols('x xd xdd ag g mu N m', real=True)
sg = sp.Symbol('sigma', real=True)            # sgn(xd) = +-1
f1, f2 = sp.symbols('fp fpp', real=True)      # f'(x), f''(x)
s = sp.sqrt(1 + f1**2)
t = sp.Matrix([1, f1]) / s                    # unit tangent (x-component > 0, so sgn(vel_t) = sgn(xd))
n = sp.Matrix([-f1, 1]) / s                   # unit normal (pointing out of the dish)
# relative-frame equations: m*a_rel = N*n - m*g*yhat - m*ag*xhat - mu*N*sg*t
ydd = f1*xdd + f2*xd**2                       # y = f(x)  =>  ydd = f' xdd + f'' xd^2
F = N*n + sp.Matrix([-m*ag, -m*g]) - mu*N*sg*t
eqs = [sp.Eq(m*xdd, F[0]), sp.Eq(m*ydd, F[1])]
sol = sp.solve(eqs, [xdd, N], dict=True)[0]
claimed = sp.Eq((1+f1**2)*xdd + f1*f2*xd**2 + g*f1 + mu*sg*(g + f2*xd**2 - f1*ag), -ag)
resid = sp.simplify(claimed.lhs.subs(xdd, sol[xdd]) - claimed.rhs)
print("residual of project EOM after substituting solved xdd:", resid)
print("normal force N/m =", sp.simplify(sol[N]/m))
print("mass cancels  :", not sol[xdd].has(m))
