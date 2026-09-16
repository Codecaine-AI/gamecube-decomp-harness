template <class T> class Probe {
public:
  virtual ~Probe() {}
  virtual int eval(T value) { return value + 7; }
  virtual void set(T value) { data = value; }
  T data;
};

template class Probe<int>;
Probe<int> instance;
Probe<int>* getInstance() { return &instance; }
