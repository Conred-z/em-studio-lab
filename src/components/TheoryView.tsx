import { ArrowRight, BookOpen, Braces, Lightbulb, RotateCcw } from 'lucide-react'

export function TheoryView({ onDemo }: { onDemo: (kind: 'covariance' | 'local' | 'soft') => void }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
      <div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-teal"><BookOpen size={18} />翻转课堂 · 讲解讲义</div><h1 className="text-3xl font-bold tracking-tight text-ink md:text-4xl">EM 不是“先分类，再更新”那么简单</h1><p className="mt-4 text-base leading-8 text-ink-soft">它把每个样本所属的簇看作未观测的隐变量，用责任度表达不确定性，再通过交替优化下界，寻找混合模型参数的局部最优解。本系统聚焦最经典的高斯混合模型（GMM）EM。</p></div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <button type="button" onClick={() => onDemo('soft')} className="group cursor-pointer rounded-lg border border-line bg-paper p-5 text-left transition hover:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><span className="text-sm font-semibold text-teal">演示 01 · 软分配</span><h2 className="mt-2 text-lg font-semibold text-ink">重叠样本属于谁？</h2><p className="mt-2 text-sm leading-6 text-ink-muted">用重叠双峰观察责任度，而不是只看硬标签。</p><span className="mt-4 flex items-center gap-1 text-xs font-semibold text-ink">载入演示 <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span></button>
        <button type="button" onClick={() => onDemo('covariance')} className="group cursor-pointer rounded-lg border border-line bg-paper p-5 text-left transition hover:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><span className="text-sm font-semibold text-teal">演示 02 · 模型结构</span><h2 className="mt-2 text-lg font-semibold text-ink">协方差如何改变椭圆？</h2><p className="mt-2 text-sm leading-6 text-ink-muted">对比完整、共享、对角和球形协方差的表达能力。</p><span className="mt-4 flex items-center gap-1 text-xs font-semibold text-ink">载入演示 <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span></button>
        <button type="button" onClick={() => onDemo('local')} className="group cursor-pointer rounded-lg border border-line bg-paper p-5 text-left transition hover:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"><span className="text-sm font-semibold text-teal">演示 03 · 局部最优</span><h2 className="mt-2 text-lg font-semibold text-ink">随机种子会改变答案</h2><p className="mt-2 text-sm leading-6 text-ink-muted">使用随机初始化，观察多次重启为何有价值。</p><span className="mt-4 flex items-center gap-1 text-xs font-semibold text-ink">载入演示 <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span></button>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <article className="space-y-9">
          <section><h2 className="border-b border-line pb-3 text-xl font-bold text-ink">一、隐变量与完整数据</h2><p className="mt-4 text-[15px] leading-8 text-ink-soft">观测样本为 xₙ，隐变量 zₙ 表示它来自哪个高斯分量。若 zₙ 已知，均值、协方差和权重很容易估计；困难在于 zₙ 未知。EM 因此用当前参数计算 zₙ 的后验分布，而不是武断地给每个样本唯一归属。</p><div className="math-block mt-4">p(xₙ | θ) = Σₖ πₖ · 𝒩(xₙ | μₖ, Σₖ)</div><p className="mt-3 text-sm leading-7 text-ink-muted">其中 πₖ ≥ 0 且 Σₖπₖ = 1；θ = {'{'}πₖ, μₖ, Σₖ{'}'} 是全部待估参数。</p></section>
          <section><h2 className="border-b border-line pb-3 text-xl font-bold text-ink">二、E 步：把不确定性写成责任度</h2><p className="mt-4 text-[15px] leading-8 text-ink-soft">固定当前参数 θᵒᵏᵈ，计算第 n 个样本属于第 k 个分量的后验概率。分母是所有分量的加权和，因此每个样本的责任度之和严格为 1。</p><div className="math-block mt-4">γₙₖ = πₖ𝒩(xₙ|μₖ,Σₖ) / Σⱼ πⱼ𝒩(xₙ|μⱼ,Σⱼ)</div><div className="mt-4 rounded-lg border-l-2 border-orange bg-orange-light/55 p-4 text-sm leading-7 text-ink-soft"><strong className="text-ink">观察入口：</strong>在“责任度”视图中，系统优先列出 max(γₙₖ) 最小的样本。它们位于分量重叠区，也是理解软聚类的关键。</div></section>
          <section><h2 className="border-b border-line pb-3 text-xl font-bold text-ink">三、M 步：用加权样本重估参数</h2><p className="mt-4 text-[15px] leading-8 text-ink-soft">固定责任度，最大化期望完整数据对数似然。Nₖ 是第 k 个分量获得的“有效样本量”，所有均值和协方差都是加权统计量。</p><div className="math-block mt-4 space-y-2"><div>Nₖ = Σₙγₙₖ;  πₖⁿᵉʷ = Nₖ / N</div><div>μₖⁿᵉʷ = (1/Nₖ) Σₙγₙₖxₙ</div><div>Σₖⁿᵉʷ = (1/Nₖ) Σₙγₙₖ(xₙ−μₖⁿᵉʷ)(xₙ−μₖⁿᵉʷ)ᵀ + λI</div></div><p className="mt-3 text-sm leading-7 text-ink-muted">λI 是本系统暴露的正则化项。它改善数值稳定性，但 λ 过大也会把椭圆“撑大”，让估计偏离数据。</p></section>
          <section><h2 className="border-b border-line pb-3 text-xl font-bold text-ink">四、为什么会收敛，又为何未必最优？</h2><p className="mt-4 text-[15px] leading-8 text-ink-soft">E 步构造当前对数似然的紧下界，M 步最大化这个下界，所以标准 GMM-EM 的观测对数似然理论上单调不减。但目标函数通常非凸，单调收敛只保证走到局部驻点，不保证全局最优。K-means++、多个随机种子和保留最佳对数似然，都是缓解局部最优的实用策略。</p><pre className="mt-4 overflow-x-auto rounded-lg bg-code p-5 font-mono text-[13px] leading-7 text-code-text"><code>{`for iteration in range(max_iter):
    # E-step：log-sum-exp 防止上溢 / 下溢
    log_prob = log(pi) + log_gaussian(X, mu, sigma)
    log_norm = logsumexp(log_prob, axis=1)
    gamma = exp(log_prob - log_norm[:, None])

    # M-step：加权充分统计量
    Nk = gamma.sum(axis=0)
    pi = Nk / N
    mu = (gamma.T @ X) / Nk[:, None]
    sigma = weighted_covariance(X, gamma, mu) + reg * I

    if abs(new_log_likelihood - old) <= tol:
        break`}</code></pre></section>
        </article>

        <aside className="space-y-6">
          <section className="rounded-lg bg-teal-dark p-5 text-paper"><Braces size={22} className="mb-4 text-mustard" /><h2 className="text-lg font-semibold">协方差结构对照</h2><dl className="mt-4 space-y-4 text-sm leading-6"><div><dt className="font-semibold">full · 完整</dt><dd className="text-paper/75">每簇独立形状与方向；最灵活，参数最多。</dd></div><div><dt className="font-semibold">tied · 共享</dt><dd className="text-paper/75">所有簇共用 Σ；同形同向，更稳定。</dd></div><div><dt className="font-semibold">diag · 对角</dt><dd className="text-paper/75">忽略特征相关；椭圆与坐标轴平行。</dd></div><div><dt className="font-semibold">spherical · 球形</dt><dd className="text-paper/75">每簇仅一个方差；最节省参数。</dd></div></dl></section>
          <section><h2 className="flex items-center gap-2 text-lg font-bold text-ink"><Lightbulb size={19} className="text-orange" />课堂提问</h2><ol className="mt-4 space-y-4 text-sm leading-7 text-ink-soft"><li><strong className="text-ink">1.</strong> 当两个样本的硬标签相同，它们对均值的贡献一定相同吗？</li><li><strong className="text-ink">2.</strong> 把 K 从 3 增至 8，训练对数似然下降是否可能？AIC/BIC 又为何可能变差？</li><li><strong className="text-ink">3.</strong> 对角协方差能否拟合旋转的椭圆簇？请用“各向异性”数据验证。</li><li><strong className="text-ink">4.</strong> 正则化趋近于 0 时，为什么单样本分量可能导致协方差奇异？</li></ol></section>
          <section className="border-t border-line pt-5"><h2 className="flex items-center gap-2 text-lg font-bold text-ink"><RotateCcw size={18} className="text-teal" />建议讲解顺序</h2><p className="mt-3 text-sm leading-7 text-ink-muted">先单步观察 μ 和椭圆移动，再切换责任度；随后固定数据与种子，只改变协方差结构；最后扫描 K 并比较 BIC。这样每次只引入一个变量，实验结论更可解释。</p></section>
        </aside>
      </div>
    </main>
  )
}
