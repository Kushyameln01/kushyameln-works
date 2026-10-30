(module
  (type (;0;) (func (param f32) (result i32)))
  (type (;1;) (func (param i32 i32 i32 i32 i32 i32) (result i32)))
  (type (;2;) (func (param i32 i32 i32 f32 f32 i32 i32) (result i32)))
  (type (;3;) (func (param i32 i32 f32 i32 i32) (result i32)))
  (type (;4;) (func (param i32 i32 i32 f32 i32 i32) (result i32)))
  (type (;5;) (func (param i32 i32 i32 i32) (result i32)))
  (type (;6;) (func (param i32 i32) (result i32)))
  (func (;0;) (type 0) (param f32) (result i32)
    (local i32 i32 f32 f32 i32 f32 f32 f32 f32 i32 i32 i32 i32)
    global.get 0
    local.set 13
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        local.get 12
                        br_table 0 (;@10;) 1 (;@9;) 2 (;@8;) 3 (;@7;) 4 (;@6;) 5 (;@5;) 6 (;@4;) 7 (;@3;) 9 (;@1;)
                      end
                      global.get 0
                      local.set 1
                      global.get 0
                      i32.const 4
                      i32.add
                      global.set 0
                      local.get 1
                      local.get 0
                      f32.store
                      global.get 0
                      local.set 2
                      global.get 0
                      i32.const 1
                      i32.add
                      global.set 0
                      local.get 2
                      i32.const 0
                      i32.store8
                      local.get 1
                      f32.load
                      local.set 3
                      local.get 1
                      f32.load
                      local.set 4
                      local.get 3
                      local.get 4
                      f32.eq
                      local.set 5
                      local.get 5
                      if  ;; label = @10
                        i32.const 3
                        local.set 12
                        br 8 (;@2;)
                      else
                        i32.const 4
                        local.set 12
                        br 8 (;@2;)
                      end
                    end
                    local.get 13
                    global.set 0
                    i32.const 0
                    return
                  end
                  i32.const 7
                  local.set 12
                  br 5 (;@2;)
                end
                local.get 1
                f32.load
                local.set 6
                local.get 1
                f32.load
                local.set 7
                local.get 6
                local.get 7
                f32.sub
                local.set 8
                i32.const 0
                f32.convert_i32_s
                local.set 9
                local.get 8
                local.get 9
                f32.eq
                local.set 10
                local.get 2
                local.get 10
                i32.store8
                i32.const 5
                local.set 12
                br 4 (;@2;)
              end
              i32.const 5
              local.set 12
              br 3 (;@2;)
            end
            local.get 2
            i32.load8_u
            local.set 11
            local.get 13
            global.set 0
            local.get 11
            return
          end
          i32.const 2
          local.set 12
          br 1 (;@2;)
        end
        i32.const 1
        local.set 12
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;1;) (type 0) (param f32) (result i32)
    (local i32 i32 i32 f32 i32 f32 f32 i32 i32 f32 f32 i32 i32 i32 i32)
    global.get 0
    local.set 15
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              local.get 14
                              br_table 0 (;@13;) 1 (;@12;) 2 (;@11;) 3 (;@10;) 4 (;@9;) 5 (;@8;) 6 (;@7;) 7 (;@6;) 8 (;@5;) 9 (;@4;) 10 (;@3;) 12 (;@1;)
                            end
                            global.get 0
                            local.set 1
                            global.get 0
                            i32.const 4
                            i32.add
                            global.set 0
                            local.get 1
                            local.get 0
                            f32.store
                            global.get 0
                            local.set 2
                            global.get 0
                            i32.const 1
                            i32.add
                            global.set 0
                            local.get 2
                            i32.const 0
                            i32.store8
                            global.get 0
                            local.set 3
                            global.get 0
                            i32.const 1
                            i32.add
                            global.set 0
                            local.get 3
                            i32.const 0
                            i32.store8
                            local.get 1
                            f32.load
                            local.set 4
                            local.get 4
                            call 0
                            local.set 5
                            local.get 5
                            if  ;; label = @13
                              i32.const 3
                              local.set 14
                              br 11 (;@2;)
                            else
                              i32.const 4
                              local.set 14
                              br 11 (;@2;)
                            end
                          end
                          local.get 15
                          global.set 0
                          i32.const 0
                          return
                        end
                        i32.const 10
                        local.set 14
                        br 8 (;@2;)
                      end
                      local.get 1
                      f32.load
                      local.set 6
                      i32.const 0
                      f32.convert_i32_s
                      local.set 7
                      local.get 6
                      local.get 7
                      f32.ge
                      local.set 8
                      local.get 3
                      local.get 8
                      i32.store8
                      i32.const 5
                      local.set 14
                      br 7 (;@2;)
                    end
                    i32.const 5
                    local.set 14
                    br 6 (;@2;)
                  end
                  local.get 3
                  i32.load8_u
                  local.set 9
                  local.get 9
                  if  ;; label = @8
                    i32.const 6
                    local.set 14
                    br 6 (;@2;)
                  else
                    i32.const 7
                    local.set 14
                    br 6 (;@2;)
                  end
                end
                local.get 1
                f32.load
                local.set 10
                i32.const 1
                f32.convert_i32_s
                local.set 11
                local.get 10
                local.get 11
                f32.le
                local.set 12
                local.get 2
                local.get 12
                i32.store8
                i32.const 8
                local.set 14
                br 4 (;@2;)
              end
              i32.const 8
              local.set 14
              br 3 (;@2;)
            end
            local.get 2
            i32.load8_u
            local.set 13
            local.get 15
            global.set 0
            local.get 13
            return
          end
          i32.const 2
          local.set 14
          br 1 (;@2;)
        end
        i32.const 1
        local.set 14
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;2;) (type 1) (param i32 i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 91
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    local.get 90
                                                                                    br_table 0 (;@40;) 1 (;@39;) 2 (;@38;) 3 (;@37;) 4 (;@36;) 5 (;@35;) 6 (;@34;) 7 (;@33;) 8 (;@32;) 9 (;@31;) 10 (;@30;) 11 (;@29;) 12 (;@28;) 13 (;@27;) 14 (;@26;) 15 (;@25;) 16 (;@24;) 17 (;@23;) 18 (;@22;) 19 (;@21;) 20 (;@20;) 21 (;@19;) 22 (;@18;) 23 (;@17;) 24 (;@16;) 25 (;@15;) 26 (;@14;) 27 (;@13;) 28 (;@12;) 29 (;@11;) 30 (;@10;) 31 (;@9;) 32 (;@8;) 33 (;@7;) 34 (;@6;) 35 (;@5;) 36 (;@4;) 37 (;@3;) 39 (;@1;)
                                                                                  end
                                                                                  global.get 0
                                                                                  local.set 6
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 6
                                                                                  local.get 0
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 7
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 7
                                                                                  local.get 1
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 8
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 8
                                                                                  local.get 2
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 9
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 9
                                                                                  local.get 3
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 10
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 10
                                                                                  local.get 4
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 11
                                                                                  global.get 0
                                                                                  i32.const 4
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 11
                                                                                  local.get 5
                                                                                  i32.store
                                                                                  global.get 0
                                                                                  local.set 12
                                                                                  global.get 0
                                                                                  i32.const 1
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 12
                                                                                  i32.const 1
                                                                                  i32.store8
                                                                                  global.get 0
                                                                                  local.set 13
                                                                                  global.get 0
                                                                                  i32.const 1
                                                                                  i32.add
                                                                                  global.set 0
                                                                                  local.get 13
                                                                                  i32.const 1
                                                                                  i32.store8
                                                                                  local.get 7
                                                                                  i32.load
                                                                                  local.set 14
                                                                                  local.get 14
                                                                                  i32.const 1000
                                                                                  i32.lt_s
                                                                                  local.set 15
                                                                                  local.get 15
                                                                                  if  ;; label = @40
                                                                                    i32.const 3
                                                                                    local.set 90
                                                                                    br 38 (;@2;)
                                                                                  else
                                                                                    i32.const 4
                                                                                    local.set 90
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                end
                                                                                local.get 91
                                                                                global.set 0
                                                                                i32.const 0
                                                                                return
                                                                              end
                                                                              global.get 0
                                                                              local.set 16
                                                                              global.get 0
                                                                              i32.const 4
                                                                              i32.add
                                                                              global.set 0
                                                                              local.get 16
                                                                              i32.const 0
                                                                              i32.store
                                                                              global.get 0
                                                                              local.set 17
                                                                              global.get 0
                                                                              i32.const 4
                                                                              i32.add
                                                                              global.set 0
                                                                              local.get 17
                                                                              i32.const 0
                                                                              i32.store
                                                                              i32.const 0
                                                                              f32.convert_i32_s
                                                                              local.set 18
                                                                              global.get 0
                                                                              local.set 19
                                                                              global.get 0
                                                                              i32.const 4
                                                                              i32.add
                                                                              global.set 0
                                                                              local.get 19
                                                                              local.get 18
                                                                              f32.store
                                                                              i32.const 0
                                                                              f32.convert_i32_s
                                                                              local.set 20
                                                                              global.get 0
                                                                              local.set 21
                                                                              global.get 0
                                                                              i32.const 4
                                                                              i32.add
                                                                              global.set 0
                                                                              local.get 21
                                                                              local.get 20
                                                                              f32.store
                                                                              i32.const 0
                                                                              f32.convert_i32_s
                                                                              local.set 22
                                                                              global.get 0
                                                                              local.set 23
                                                                              global.get 0
                                                                              i32.const 4
                                                                              i32.add
                                                                              global.set 0
                                                                              local.get 23
                                                                              local.get 22
                                                                              f32.store
                                                                              i32.const 15
                                                                              local.set 90
                                                                              br 35 (;@2;)
                                                                            end
                                                                            i32.const 5
                                                                            local.set 90
                                                                            br 34 (;@2;)
                                                                          end
                                                                          local.get 9
                                                                          i32.load
                                                                          local.set 24
                                                                          local.get 24
                                                                          i32.const 7
                                                                          i32.lt_s
                                                                          local.set 25
                                                                          local.get 13
                                                                          local.get 25
                                                                          i32.store8
                                                                          i32.const 5
                                                                          local.set 90
                                                                          br 33 (;@2;)
                                                                        end
                                                                        local.get 13
                                                                        i32.load8_u
                                                                        local.set 26
                                                                        local.get 26
                                                                        if  ;; label = @35
                                                                          i32.const 6
                                                                          local.set 90
                                                                          br 33 (;@2;)
                                                                        else
                                                                          i32.const 7
                                                                          local.set 90
                                                                          br 33 (;@2;)
                                                                        end
                                                                      end
                                                                      i32.const 8
                                                                      local.set 90
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 11
                                                                    i32.load
                                                                    local.set 27
                                                                    local.get 27
                                                                    i32.const 6
                                                                    i32.lt_s
                                                                    local.set 28
                                                                    local.get 12
                                                                    local.get 28
                                                                    i32.store8
                                                                    i32.const 8
                                                                    local.set 90
                                                                    br 30 (;@2;)
                                                                  end
                                                                  local.get 12
                                                                  i32.load8_u
                                                                  local.set 29
                                                                  local.get 29
                                                                  if  ;; label = @32
                                                                    i32.const 9
                                                                    local.set 90
                                                                    br 30 (;@2;)
                                                                  else
                                                                    i32.const 10
                                                                    local.set 90
                                                                    br 30 (;@2;)
                                                                  end
                                                                end
                                                                i32.const 0
                                                                i32.const 1
                                                                i32.sub
                                                                local.set 30
                                                                local.get 91
                                                                global.set 0
                                                                local.get 30
                                                                return
                                                              end
                                                              i32.const 11
                                                              local.set 90
                                                              br 27 (;@2;)
                                                            end
                                                            i32.const 2
                                                            local.set 90
                                                            br 26 (;@2;)
                                                          end
                                                          i32.const 11
                                                          local.set 90
                                                          br 25 (;@2;)
                                                        end
                                                        local.get 16
                                                        i32.const 0
                                                        i32.store
                                                        i32.const 26
                                                        local.set 90
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 13
                                                      local.set 90
                                                      br 23 (;@2;)
                                                    end
                                                    local.get 16
                                                    i32.load
                                                    local.set 31
                                                    local.get 31
                                                    i32.const 1000
                                                    i32.lt_s
                                                    local.set 32
                                                    local.get 32
                                                    if  ;; label = @25
                                                      i32.const 19
                                                      local.set 90
                                                      br 23 (;@2;)
                                                    else
                                                      i32.const 20
                                                      local.set 90
                                                      br 23 (;@2;)
                                                    end
                                                  end
                                                  i32.const 14
                                                  local.set 90
                                                  br 21 (;@2;)
                                                end
                                                i32.const 15
                                                local.set 90
                                                br 20 (;@2;)
                                              end
                                              i32.const 17
                                              local.set 90
                                              br 19 (;@2;)
                                            end
                                            local.get 16
                                            i32.load
                                            local.set 33
                                            local.get 33
                                            i32.const 1
                                            i32.add
                                            local.set 34
                                            local.get 34
                                            f32.convert_i32_s
                                            local.set 35
                                            i32.const 1000
                                            f32.convert_i32_s
                                            local.set 36
                                            local.get 35
                                            local.get 36
                                            f32.div
                                            local.set 37
                                            local.get 19
                                            local.get 37
                                            f32.store
                                            local.get 19
                                            f32.load
                                            local.set 38
                                            i32.const 1000
                                            f32.convert_i32_s
                                            local.set 39
                                            local.get 38
                                            local.get 39
                                            f32.mul
                                            local.set 40
                                            local.get 19
                                            local.get 40
                                            f32.store
                                            local.get 19
                                            f32.load
                                            local.set 41
                                            i32.const 1000
                                            f32.convert_i32_s
                                            local.set 42
                                            local.get 41
                                            local.get 42
                                            f32.div
                                            local.set 43
                                            local.get 19
                                            local.get 43
                                            f32.store
                                            i32.const 5
                                            f32.convert_i32_s
                                            local.set 44
                                            local.get 19
                                            f32.load
                                            local.set 45
                                            local.get 44
                                            local.get 45
                                            f32.mul
                                            local.set 46
                                            local.get 21
                                            local.get 46
                                            f32.store
                                            i32.const 1
                                            f32.convert_i32_s
                                            local.set 47
                                            i32.const 4
                                            f32.convert_i32_s
                                            local.set 48
                                            local.get 19
                                            f32.load
                                            local.set 49
                                            local.get 48
                                            local.get 49
                                            f32.mul
                                            local.set 50
                                            local.get 47
                                            local.get 50
                                            f32.add
                                            local.set 51
                                            local.get 23
                                            local.get 51
                                            f32.store
                                            local.get 21
                                            f32.load
                                            local.set 52
                                            local.get 23
                                            f32.load
                                            local.set 53
                                            local.get 52
                                            local.get 53
                                            f32.div
                                            local.set 54
                                            local.get 6
                                            i32.load
                                            local.set 55
                                            local.get 6
                                            i32.load
                                            local.set 56
                                            local.get 16
                                            i32.load
                                            local.set 57
                                            local.get 6
                                            i32.load
                                            local.set 58
                                            local.get 58
                                            local.get 57
                                            i32.const 4
                                            i32.mul
                                            i32.add
                                            local.set 59
                                            local.get 59
                                            local.get 54
                                            f32.store
                                            local.get 16
                                            i32.load
                                            local.set 60
                                            local.get 60
                                            i32.const 1
                                            i32.add
                                            local.set 61
                                            local.get 16
                                            local.get 61
                                            i32.store
                                            i32.const 21
                                            local.set 90
                                            br 18 (;@2;)
                                          end
                                          i32.const 14
                                          local.set 90
                                          br 17 (;@2;)
                                        end
                                        i32.const 18
                                        local.set 90
                                        br 16 (;@2;)
                                      end
                                      i32.const 21
                                      local.set 90
                                      br 15 (;@2;)
                                    end
                                    i32.const 15
                                    local.set 90
                                    br 14 (;@2;)
                                  end
                                  i32.const 0
                                  f32.convert_i32_s
                                  local.set 62
                                  local.get 8
                                  i32.load
                                  local.set 63
                                  local.get 8
                                  i32.load
                                  local.set 64
                                  local.get 8
                                  i32.load
                                  local.set 65
                                  local.get 65
                                  i32.const 6
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 66
                                  local.get 66
                                  local.get 62
                                  f32.store
                                  local.get 91
                                  global.set 0
                                  i32.const 0
                                  return
                                end
                                i32.const 24
                                local.set 90
                                br 12 (;@2;)
                              end
                              local.get 16
                              i32.load
                              local.set 67
                              local.get 67
                              i32.const 6
                              i32.lt_s
                              local.set 68
                              local.get 68
                              if  ;; label = @14
                                i32.const 30
                                local.set 90
                                br 12 (;@2;)
                              else
                                i32.const 31
                                local.set 90
                                br 12 (;@2;)
                              end
                            end
                            i32.const 25
                            local.set 90
                            br 10 (;@2;)
                          end
                          i32.const 26
                          local.set 90
                          br 9 (;@2;)
                        end
                        i32.const 28
                        local.set 90
                        br 8 (;@2;)
                      end
                      local.get 16
                      i32.load
                      local.set 69
                      local.get 69
                      i32.const 1000
                      i32.mul
                      local.set 70
                      local.get 70
                      i32.const 6
                      i32.div_s
                      local.set 71
                      i32.const 999
                      local.get 71
                      i32.sub
                      local.set 72
                      local.get 17
                      local.get 72
                      i32.store
                      local.get 17
                      i32.load
                      local.set 73
                      local.get 10
                      i32.load
                      local.set 74
                      local.get 10
                      i32.load
                      local.set 75
                      local.get 16
                      i32.load
                      local.set 76
                      local.get 10
                      i32.load
                      local.set 77
                      local.get 77
                      local.get 76
                      i32.const 4
                      i32.mul
                      i32.add
                      local.set 78
                      local.get 78
                      local.get 73
                      i32.store
                      local.get 6
                      i32.load
                      local.set 79
                      local.get 17
                      i32.load
                      local.set 80
                      local.get 79
                      local.get 80
                      i32.const 4
                      i32.mul
                      i32.add
                      local.set 81
                      local.get 81
                      f32.load
                      local.set 82
                      local.get 8
                      i32.load
                      local.set 83
                      local.get 8
                      i32.load
                      local.set 84
                      local.get 16
                      i32.load
                      local.set 85
                      local.get 8
                      i32.load
                      local.set 86
                      local.get 86
                      local.get 85
                      i32.const 4
                      i32.mul
                      i32.add
                      local.set 87
                      local.get 87
                      local.get 82
                      f32.store
                      local.get 16
                      i32.load
                      local.set 88
                      local.get 88
                      i32.const 1
                      i32.add
                      local.set 89
                      local.get 16
                      local.get 89
                      i32.store
                      i32.const 32
                      local.set 90
                      br 7 (;@2;)
                    end
                    i32.const 25
                    local.set 90
                    br 6 (;@2;)
                  end
                  i32.const 29
                  local.set 90
                  br 5 (;@2;)
                end
                i32.const 32
                local.set 90
                br 4 (;@2;)
              end
              i32.const 26
              local.set 90
              br 3 (;@2;)
            end
            i32.const 37
            local.set 90
            br 2 (;@2;)
          end
          i32.const 35
          local.set 90
          br 1 (;@2;)
        end
        i32.const 1
        local.set 90
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;3;) (type 1) (param i32 i32 i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 8
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 7
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                local.get 5
                call 2
                local.set 6
                local.get 8
                global.set 0
                local.get 6
                return
              end
              local.get 8
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 7
            br 2 (;@2;)
          end
          i32.const 2
          local.set 7
          br 1 (;@2;)
        end
        i32.const 1
        local.set 7
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;4;) (type 2) (param i32 i32 i32 f32 f32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 i32 f32 i32 f32 i32 f32 f32 f32 i32 f32 i32 i32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 f32 f32 f32 f32 f32 f32 i32 i32 i32 f32 f32 f32 f32 f32 f32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 107
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                block  ;; label = @55
                                                                                                                  block  ;; label = @56
                                                                                                                    block  ;; label = @57
                                                                                                                      block  ;; label = @58
                                                                                                                        block  ;; label = @59
                                                                                                                          block  ;; label = @60
                                                                                                                            block  ;; label = @61
                                                                                                                              block  ;; label = @62
                                                                                                                                block  ;; label = @63
                                                                                                                                  block  ;; label = @64
                                                                                                                                    block  ;; label = @65
                                                                                                                                      block  ;; label = @66
                                                                                                                                        local.get 106
                                                                                                                                        br_table 0 (;@66;) 1 (;@65;) 2 (;@64;) 3 (;@63;) 4 (;@62;) 5 (;@61;) 6 (;@60;) 7 (;@59;) 8 (;@58;) 9 (;@57;) 10 (;@56;) 11 (;@55;) 12 (;@54;) 13 (;@53;) 14 (;@52;) 15 (;@51;) 16 (;@50;) 17 (;@49;) 18 (;@48;) 19 (;@47;) 20 (;@46;) 21 (;@45;) 22 (;@44;) 23 (;@43;) 24 (;@42;) 25 (;@41;) 26 (;@40;) 27 (;@39;) 28 (;@38;) 29 (;@37;) 30 (;@36;) 31 (;@35;) 32 (;@34;) 33 (;@33;) 34 (;@32;) 35 (;@31;) 36 (;@30;) 37 (;@29;) 38 (;@28;) 39 (;@27;) 40 (;@26;) 41 (;@25;) 42 (;@24;) 43 (;@23;) 44 (;@22;) 45 (;@21;) 46 (;@20;) 47 (;@19;) 48 (;@18;) 49 (;@17;) 50 (;@16;) 51 (;@15;) 52 (;@14;) 53 (;@13;) 54 (;@12;) 55 (;@11;) 56 (;@10;) 57 (;@9;) 58 (;@8;) 59 (;@7;) 60 (;@6;) 61 (;@5;) 62 (;@4;) 63 (;@3;) 65 (;@1;)
                                                                                                                                      end
                                                                                                                                      global.get 0
                                                                                                                                      local.set 7
                                                                                                                                      global.get 0
                                                                                                                                      i32.const 4
                                                                                                                                      i32.add
                                                                                                                                      global.set 0
                                                                                                                                      local.get 7
                                                                                                                                      local.get 0
                                                                                                                                      i32.store
                                                                                                                                      global.get 0
                                                                                                                                      local.set 8
                                                                                                                                      global.get 0
                                                                                                                                      i32.const 4
                                                                                                                                      i32.add
                                                                                                                                      global.set 0
                                                                                                                                      local.get 8
                                                                                                                                      local.get 1
                                                                                                                                      i32.store
                                                                                                                                      global.get 0
                                                                                                                                      local.set 9
                                                                                                                                      global.get 0
                                                                                                                                      i32.const 4
                                                                                                                                      i32.add
                                                                                                                                      global.set 0
                                                                                                                                      local.get 9
                                                                                                                                      local.get 2
                                                                                                                                      i32.store
                                                                                                                                      global.get 0
                                                                                                                                      local.set 10
                                                                                                                                      global.get 0
                                                                                                                                      i32.const 4
                                                                                                                                      i32.add
                                                                                                                                      global.set 0
                                                                                                                                      local.get 10
                                                                                                                                      local.get 3
                                                                                                                                      f32.store
                                                                                                                                      global.get 0
                                                                                                                                      local.set 11
                                                                                                                                      global.get 0
                                                                                                                                      i32.const 4
                                                                                                                                      i32.add
                                                                                                                                      global.set 0
                                                                                                                                      local.get 11
                                                                                                                                      local.get 4
                                                                                                                                      f32.store
                                                                                                                                      global.get 0
                                                                                                                                      local.set 12
                                                                                                                                      global.get 0
                                                                                                                                      i32.const 4
                                                                                                                                      i32.add
                                                                                                                                      global.set 0
                                                                                                                                      local.get 12
                                                                                                                                      local.get 5
                                                                                                                                      i32.store
                                                                                                                                      global.get 0
                                                                                                                                      local.set 13
                                                                                                                                      global.get 0
                                                                                                                                      i32.const 4
                                                                                                                                      i32.add
                                                                                                                                      global.set 0
                                                                                                                                      local.get 13
                                                                                                                                      local.get 6
                                                                                                                                      i32.store
                                                                                                                                      global.get 0
                                                                                                                                      local.set 14
                                                                                                                                      global.get 0
                                                                                                                                      i32.const 1
                                                                                                                                      i32.add
                                                                                                                                      global.set 0
                                                                                                                                      local.get 14
                                                                                                                                      i32.const 1
                                                                                                                                      i32.store8
                                                                                                                                      global.get 0
                                                                                                                                      local.set 15
                                                                                                                                      global.get 0
                                                                                                                                      i32.const 1
                                                                                                                                      i32.add
                                                                                                                                      global.set 0
                                                                                                                                      local.get 15
                                                                                                                                      i32.const 1
                                                                                                                                      i32.store8
                                                                                                                                      local.get 9
                                                                                                                                      i32.load
                                                                                                                                      local.set 16
                                                                                                                                      local.get 16
                                                                                                                                      i32.const 1
                                                                                                                                      i32.lt_s
                                                                                                                                      local.set 17
                                                                                                                                      local.get 17
                                                                                                                                      if  ;; label = @66
                                                                                                                                        i32.const 3
                                                                                                                                        local.set 106
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      else
                                                                                                                                        i32.const 4
                                                                                                                                        local.set 106
                                                                                                                                        br 64 (;@2;)
                                                                                                                                      end
                                                                                                                                    end
                                                                                                                                    local.get 107
                                                                                                                                    global.set 0
                                                                                                                                    i32.const 0
                                                                                                                                    return
                                                                                                                                  end
                                                                                                                                  global.get 0
                                                                                                                                  local.set 18
                                                                                                                                  global.get 0
                                                                                                                                  i32.const 1
                                                                                                                                  i32.add
                                                                                                                                  global.set 0
                                                                                                                                  local.get 18
                                                                                                                                  i32.const 1
                                                                                                                                  i32.store8
                                                                                                                                  global.get 0
                                                                                                                                  local.set 19
                                                                                                                                  global.get 0
                                                                                                                                  i32.const 1
                                                                                                                                  i32.add
                                                                                                                                  global.set 0
                                                                                                                                  local.get 19
                                                                                                                                  i32.const 1
                                                                                                                                  i32.store8
                                                                                                                                  local.get 10
                                                                                                                                  f32.load
                                                                                                                                  local.set 20
                                                                                                                                  local.get 20
                                                                                                                                  call 1
                                                                                                                                  local.set 21
                                                                                                                                  local.get 21
                                                                                                                                  i32.eqz
                                                                                                                                  local.set 22
                                                                                                                                  local.get 22
                                                                                                                                  if  ;; label = @64
                                                                                                                                    i32.const 14
                                                                                                                                    local.set 106
                                                                                                                                    br 62 (;@2;)
                                                                                                                                  else
                                                                                                                                    i32.const 15
                                                                                                                                    local.set 106
                                                                                                                                    br 62 (;@2;)
                                                                                                                                  end
                                                                                                                                end
                                                                                                                                i32.const 5
                                                                                                                                local.set 106
                                                                                                                                br 60 (;@2;)
                                                                                                                              end
                                                                                                                              local.get 9
                                                                                                                              i32.load
                                                                                                                              local.set 23
                                                                                                                              local.get 23
                                                                                                                              i32.const 4096
                                                                                                                              i32.gt_s
                                                                                                                              local.set 24
                                                                                                                              local.get 15
                                                                                                                              local.get 24
                                                                                                                              i32.store8
                                                                                                                              i32.const 5
                                                                                                                              local.set 106
                                                                                                                              br 59 (;@2;)
                                                                                                                            end
                                                                                                                            local.get 15
                                                                                                                            i32.load8_u
                                                                                                                            local.set 25
                                                                                                                            local.get 25
                                                                                                                            if  ;; label = @61
                                                                                                                              i32.const 6
                                                                                                                              local.set 106
                                                                                                                              br 59 (;@2;)
                                                                                                                            else
                                                                                                                              i32.const 7
                                                                                                                              local.set 106
                                                                                                                              br 59 (;@2;)
                                                                                                                            end
                                                                                                                          end
                                                                                                                          i32.const 8
                                                                                                                          local.set 106
                                                                                                                          br 57 (;@2;)
                                                                                                                        end
                                                                                                                        local.get 13
                                                                                                                        i32.load
                                                                                                                        local.set 26
                                                                                                                        local.get 9
                                                                                                                        i32.load
                                                                                                                        local.set 27
                                                                                                                        local.get 26
                                                                                                                        local.get 27
                                                                                                                        i32.lt_s
                                                                                                                        local.set 28
                                                                                                                        local.get 14
                                                                                                                        local.get 28
                                                                                                                        i32.store8
                                                                                                                        i32.const 8
                                                                                                                        local.set 106
                                                                                                                        br 56 (;@2;)
                                                                                                                      end
                                                                                                                      local.get 14
                                                                                                                      i32.load8_u
                                                                                                                      local.set 29
                                                                                                                      local.get 29
                                                                                                                      if  ;; label = @58
                                                                                                                        i32.const 9
                                                                                                                        local.set 106
                                                                                                                        br 56 (;@2;)
                                                                                                                      else
                                                                                                                        i32.const 10
                                                                                                                        local.set 106
                                                                                                                        br 56 (;@2;)
                                                                                                                      end
                                                                                                                    end
                                                                                                                    i32.const 0
                                                                                                                    i32.const 1
                                                                                                                    i32.sub
                                                                                                                    local.set 30
                                                                                                                    local.get 107
                                                                                                                    global.set 0
                                                                                                                    local.get 30
                                                                                                                    return
                                                                                                                  end
                                                                                                                  i32.const 11
                                                                                                                  local.set 106
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                                i32.const 2
                                                                                                                local.set 106
                                                                                                                br 52 (;@2;)
                                                                                                              end
                                                                                                              i32.const 11
                                                                                                              local.set 106
                                                                                                              br 51 (;@2;)
                                                                                                            end
                                                                                                            global.get 0
                                                                                                            local.set 31
                                                                                                            global.get 0
                                                                                                            i32.const 4
                                                                                                            i32.add
                                                                                                            global.set 0
                                                                                                            local.get 31
                                                                                                            i32.const 0
                                                                                                            i32.store
                                                                                                            i32.const 0
                                                                                                            f32.convert_i32_s
                                                                                                            local.set 32
                                                                                                            global.get 0
                                                                                                            local.set 33
                                                                                                            global.get 0
                                                                                                            i32.const 4
                                                                                                            i32.add
                                                                                                            global.set 0
                                                                                                            local.get 33
                                                                                                            local.get 32
                                                                                                            f32.store
                                                                                                            i32.const 0
                                                                                                            f32.convert_i32_s
                                                                                                            local.set 34
                                                                                                            global.get 0
                                                                                                            local.set 35
                                                                                                            global.get 0
                                                                                                            i32.const 4
                                                                                                            i32.add
                                                                                                            global.set 0
                                                                                                            local.get 35
                                                                                                            local.get 34
                                                                                                            f32.store
                                                                                                            i32.const 0
                                                                                                            f32.convert_i32_s
                                                                                                            local.set 36
                                                                                                            global.get 0
                                                                                                            local.set 37
                                                                                                            global.get 0
                                                                                                            i32.const 4
                                                                                                            i32.add
                                                                                                            global.set 0
                                                                                                            local.get 37
                                                                                                            local.get 36
                                                                                                            f32.store
                                                                                                            i32.const 0
                                                                                                            f32.convert_i32_s
                                                                                                            local.set 38
                                                                                                            global.get 0
                                                                                                            local.set 39
                                                                                                            global.get 0
                                                                                                            i32.const 4
                                                                                                            i32.add
                                                                                                            global.set 0
                                                                                                            local.get 39
                                                                                                            local.get 38
                                                                                                            f32.store
                                                                                                            i32.const 1
                                                                                                            f32.convert_i32_s
                                                                                                            local.set 40
                                                                                                            local.get 10
                                                                                                            f32.load
                                                                                                            local.set 41
                                                                                                            local.get 40
                                                                                                            local.get 41
                                                                                                            f32.sub
                                                                                                            local.set 42
                                                                                                            global.get 0
                                                                                                            local.set 43
                                                                                                            global.get 0
                                                                                                            i32.const 4
                                                                                                            i32.add
                                                                                                            global.set 0
                                                                                                            local.get 43
                                                                                                            local.get 42
                                                                                                            f32.store
                                                                                                            i32.const 26
                                                                                                            local.set 106
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          i32.const 16
                                                                                                          local.set 106
                                                                                                          br 49 (;@2;)
                                                                                                        end
                                                                                                        local.get 11
                                                                                                        f32.load
                                                                                                        local.set 44
                                                                                                        local.get 44
                                                                                                        call 0
                                                                                                        local.set 45
                                                                                                        local.get 45
                                                                                                        i32.eqz
                                                                                                        local.set 46
                                                                                                        local.get 19
                                                                                                        local.get 46
                                                                                                        i32.store8
                                                                                                        i32.const 16
                                                                                                        local.set 106
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                      local.get 19
                                                                                                      i32.load8_u
                                                                                                      local.set 47
                                                                                                      local.get 47
                                                                                                      if  ;; label = @50
                                                                                                        i32.const 17
                                                                                                        local.set 106
                                                                                                        br 48 (;@2;)
                                                                                                      else
                                                                                                        i32.const 18
                                                                                                        local.set 106
                                                                                                        br 48 (;@2;)
                                                                                                      end
                                                                                                    end
                                                                                                    i32.const 19
                                                                                                    local.set 106
                                                                                                    br 46 (;@2;)
                                                                                                  end
                                                                                                  local.get 11
                                                                                                  f32.load
                                                                                                  local.set 48
                                                                                                  i32.const 0
                                                                                                  f32.convert_i32_s
                                                                                                  local.set 49
                                                                                                  local.get 48
                                                                                                  local.get 49
                                                                                                  f32.lt
                                                                                                  local.set 50
                                                                                                  local.get 18
                                                                                                  local.get 50
                                                                                                  i32.store8
                                                                                                  i32.const 19
                                                                                                  local.set 106
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                local.get 18
                                                                                                i32.load8_u
                                                                                                local.set 51
                                                                                                local.get 51
                                                                                                if  ;; label = @47
                                                                                                  i32.const 20
                                                                                                  local.set 106
                                                                                                  br 45 (;@2;)
                                                                                                else
                                                                                                  i32.const 21
                                                                                                  local.set 106
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                              end
                                                                                              i32.const 0
                                                                                              i32.const 2
                                                                                              i32.sub
                                                                                              local.set 52
                                                                                              local.get 107
                                                                                              global.set 0
                                                                                              local.get 52
                                                                                              return
                                                                                            end
                                                                                            i32.const 22
                                                                                            local.set 106
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          i32.const 13
                                                                                          local.set 106
                                                                                          br 41 (;@2;)
                                                                                        end
                                                                                        i32.const 22
                                                                                        local.set 106
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      local.get 31
                                                                                      i32.const 0
                                                                                      i32.store
                                                                                      i32.const 46
                                                                                      local.set 106
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 24
                                                                                    local.set 106
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  local.get 31
                                                                                  i32.load
                                                                                  local.set 53
                                                                                  local.get 9
                                                                                  i32.load
                                                                                  local.set 54
                                                                                  local.get 53
                                                                                  local.get 54
                                                                                  i32.lt_s
                                                                                  local.set 55
                                                                                  local.get 55
                                                                                  if  ;; label = @40
                                                                                    i32.const 30
                                                                                    local.set 106
                                                                                    br 38 (;@2;)
                                                                                  else
                                                                                    i32.const 31
                                                                                    local.set 106
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                end
                                                                                i32.const 25
                                                                                local.set 106
                                                                                br 36 (;@2;)
                                                                              end
                                                                              i32.const 26
                                                                              local.set 106
                                                                              br 35 (;@2;)
                                                                            end
                                                                            i32.const 28
                                                                            local.set 106
                                                                            br 34 (;@2;)
                                                                          end
                                                                          global.get 0
                                                                          local.set 56
                                                                          global.get 0
                                                                          i32.const 1
                                                                          i32.add
                                                                          global.set 0
                                                                          local.get 56
                                                                          i32.const 1
                                                                          i32.store8
                                                                          local.get 7
                                                                          i32.load
                                                                          local.set 57
                                                                          local.get 31
                                                                          i32.load
                                                                          local.set 58
                                                                          local.get 57
                                                                          local.get 58
                                                                          i32.const 4
                                                                          i32.mul
                                                                          i32.add
                                                                          local.set 59
                                                                          local.get 59
                                                                          f32.load
                                                                          local.set 60
                                                                          local.get 60
                                                                          call 0
                                                                          local.set 61
                                                                          local.get 61
                                                                          i32.eqz
                                                                          local.set 62
                                                                          local.get 62
                                                                          if  ;; label = @36
                                                                            i32.const 34
                                                                            local.set 106
                                                                            br 34 (;@2;)
                                                                          else
                                                                            i32.const 35
                                                                            local.set 106
                                                                            br 34 (;@2;)
                                                                          end
                                                                        end
                                                                        i32.const 25
                                                                        local.set 106
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 29
                                                                      local.set 106
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 31
                                                                    i32.load
                                                                    local.set 63
                                                                    local.get 63
                                                                    i32.const 1
                                                                    i32.add
                                                                    local.set 64
                                                                    local.get 31
                                                                    local.get 64
                                                                    i32.store
                                                                    i32.const 41
                                                                    local.set 106
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 36
                                                                  local.set 106
                                                                  br 29 (;@2;)
                                                                end
                                                                local.get 8
                                                                i32.load
                                                                local.set 65
                                                                local.get 31
                                                                i32.load
                                                                local.set 66
                                                                local.get 65
                                                                local.get 66
                                                                i32.const 4
                                                                i32.mul
                                                                i32.add
                                                                local.set 67
                                                                local.get 67
                                                                f32.load
                                                                local.set 68
                                                                local.get 68
                                                                call 0
                                                                local.set 69
                                                                local.get 69
                                                                i32.eqz
                                                                local.set 70
                                                                local.get 56
                                                                local.get 70
                                                                i32.store8
                                                                i32.const 36
                                                                local.set 106
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 56
                                                              i32.load8_u
                                                              local.set 71
                                                              local.get 71
                                                              if  ;; label = @30
                                                                i32.const 37
                                                                local.set 106
                                                                br 28 (;@2;)
                                                              else
                                                                i32.const 38
                                                                local.set 106
                                                                br 28 (;@2;)
                                                              end
                                                            end
                                                            i32.const 0
                                                            i32.const 2
                                                            i32.sub
                                                            local.set 72
                                                            local.get 107
                                                            global.set 0
                                                            local.get 72
                                                            return
                                                          end
                                                          i32.const 39
                                                          local.set 106
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 33
                                                        local.set 106
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 39
                                                      local.set 106
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 32
                                                    local.set 106
                                                    br 22 (;@2;)
                                                  end
                                                  i32.const 32
                                                  local.set 106
                                                  br 21 (;@2;)
                                                end
                                                i32.const 26
                                                local.set 106
                                                br 20 (;@2;)
                                              end
                                              local.get 107
                                              global.set 0
                                              i32.const 0
                                              return
                                            end
                                            i32.const 44
                                            local.set 106
                                            br 18 (;@2;)
                                          end
                                          local.get 31
                                          i32.load
                                          local.set 73
                                          local.get 9
                                          i32.load
                                          local.set 74
                                          local.get 73
                                          local.get 74
                                          i32.lt_s
                                          local.set 75
                                          local.get 75
                                          if  ;; label = @20
                                            i32.const 50
                                            local.set 106
                                            br 18 (;@2;)
                                          else
                                            i32.const 51
                                            local.set 106
                                            br 18 (;@2;)
                                          end
                                        end
                                        i32.const 45
                                        local.set 106
                                        br 16 (;@2;)
                                      end
                                      i32.const 46
                                      local.set 106
                                      br 15 (;@2;)
                                    end
                                    i32.const 48
                                    local.set 106
                                    br 14 (;@2;)
                                  end
                                  local.get 11
                                  f32.load
                                  local.set 76
                                  local.get 7
                                  i32.load
                                  local.set 77
                                  local.get 31
                                  i32.load
                                  local.set 78
                                  local.get 77
                                  local.get 78
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 79
                                  local.get 79
                                  f32.load
                                  local.set 80
                                  local.get 76
                                  local.get 80
                                  f32.mul
                                  local.set 81
                                  local.get 33
                                  local.get 81
                                  f32.store
                                  local.get 10
                                  f32.load
                                  local.set 82
                                  local.get 33
                                  f32.load
                                  local.set 83
                                  local.get 82
                                  local.get 83
                                  f32.mul
                                  local.set 84
                                  local.get 35
                                  local.get 84
                                  f32.store
                                  local.get 43
                                  f32.load
                                  local.set 85
                                  local.get 8
                                  i32.load
                                  local.set 86
                                  local.get 31
                                  i32.load
                                  local.set 87
                                  local.get 86
                                  local.get 87
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 88
                                  local.get 88
                                  f32.load
                                  local.set 89
                                  local.get 85
                                  local.get 89
                                  f32.mul
                                  local.set 90
                                  local.get 37
                                  local.get 90
                                  f32.store
                                  local.get 35
                                  f32.load
                                  local.set 91
                                  local.get 37
                                  f32.load
                                  local.set 92
                                  local.get 91
                                  local.get 92
                                  f32.add
                                  local.set 93
                                  local.get 39
                                  local.get 93
                                  f32.store
                                  local.get 39
                                  f32.load
                                  local.set 94
                                  local.get 94
                                  call 0
                                  local.set 95
                                  local.get 95
                                  i32.eqz
                                  local.set 96
                                  local.get 96
                                  if  ;; label = @16
                                    i32.const 54
                                    local.set 106
                                    br 14 (;@2;)
                                  else
                                    i32.const 55
                                    local.set 106
                                    br 14 (;@2;)
                                  end
                                end
                                i32.const 45
                                local.set 106
                                br 12 (;@2;)
                              end
                              i32.const 49
                              local.set 106
                              br 11 (;@2;)
                            end
                            local.get 39
                            f32.load
                            local.set 97
                            local.get 12
                            i32.load
                            local.set 98
                            local.get 12
                            i32.load
                            local.set 99
                            local.get 31
                            i32.load
                            local.set 100
                            local.get 12
                            i32.load
                            local.set 101
                            local.get 101
                            local.get 100
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 102
                            local.get 102
                            local.get 97
                            f32.store
                            local.get 31
                            i32.load
                            local.set 103
                            local.get 103
                            i32.const 1
                            i32.add
                            local.set 104
                            local.get 31
                            local.get 104
                            i32.store
                            i32.const 58
                            local.set 106
                            br 10 (;@2;)
                          end
                          i32.const 0
                          i32.const 3
                          i32.sub
                          local.set 105
                          local.get 107
                          global.set 0
                          local.get 105
                          return
                        end
                        i32.const 56
                        local.set 106
                        br 8 (;@2;)
                      end
                      i32.const 53
                      local.set 106
                      br 7 (;@2;)
                    end
                    i32.const 56
                    local.set 106
                    br 6 (;@2;)
                  end
                  i32.const 52
                  local.set 106
                  br 5 (;@2;)
                end
                i32.const 52
                local.set 106
                br 4 (;@2;)
              end
              i32.const 46
              local.set 106
              br 3 (;@2;)
            end
            i32.const 63
            local.set 106
            br 2 (;@2;)
          end
          i32.const 61
          local.set 106
          br 1 (;@2;)
        end
        i32.const 1
        local.set 106
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;5;) (type 2) (param i32 i32 i32 f32 f32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 9
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 8
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                local.get 5
                local.get 6
                call 4
                local.set 7
                local.get 9
                global.set 0
                local.get 7
                return
              end
              local.get 9
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 8
            br 2 (;@2;)
          end
          i32.const 2
          local.set 8
          br 1 (;@2;)
        end
        i32.const 1
        local.set 8
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;6;) (type 3) (param i32 i32 f32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 f32 i32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 72
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                block  ;; label = @55
                                                                                                                  block  ;; label = @56
                                                                                                                    block  ;; label = @57
                                                                                                                      block  ;; label = @58
                                                                                                                        block  ;; label = @59
                                                                                                                          block  ;; label = @60
                                                                                                                            local.get 71
                                                                                                                            br_table 0 (;@60;) 1 (;@59;) 2 (;@58;) 3 (;@57;) 4 (;@56;) 5 (;@55;) 6 (;@54;) 7 (;@53;) 8 (;@52;) 9 (;@51;) 10 (;@50;) 11 (;@49;) 12 (;@48;) 13 (;@47;) 14 (;@46;) 15 (;@45;) 16 (;@44;) 17 (;@43;) 18 (;@42;) 19 (;@41;) 20 (;@40;) 21 (;@39;) 22 (;@38;) 23 (;@37;) 24 (;@36;) 25 (;@35;) 26 (;@34;) 27 (;@33;) 28 (;@32;) 29 (;@31;) 30 (;@30;) 31 (;@29;) 32 (;@28;) 33 (;@27;) 34 (;@26;) 35 (;@25;) 36 (;@24;) 37 (;@23;) 38 (;@22;) 39 (;@21;) 40 (;@20;) 41 (;@19;) 42 (;@18;) 43 (;@17;) 44 (;@16;) 45 (;@15;) 46 (;@14;) 47 (;@13;) 48 (;@12;) 49 (;@11;) 50 (;@10;) 51 (;@9;) 52 (;@8;) 53 (;@7;) 54 (;@6;) 55 (;@5;) 56 (;@4;) 57 (;@3;) 59 (;@1;)
                                                                                                                          end
                                                                                                                          global.get 0
                                                                                                                          local.set 5
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 5
                                                                                                                          local.get 0
                                                                                                                          i32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 6
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 6
                                                                                                                          local.get 1
                                                                                                                          i32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 7
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 7
                                                                                                                          local.get 2
                                                                                                                          f32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 8
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 8
                                                                                                                          local.get 3
                                                                                                                          i32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 9
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 9
                                                                                                                          local.get 4
                                                                                                                          i32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 10
                                                                                                                          global.get 0
                                                                                                                          i32.const 1
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 10
                                                                                                                          i32.const 1
                                                                                                                          i32.store8
                                                                                                                          global.get 0
                                                                                                                          local.set 11
                                                                                                                          global.get 0
                                                                                                                          i32.const 1
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 11
                                                                                                                          i32.const 1
                                                                                                                          i32.store8
                                                                                                                          local.get 6
                                                                                                                          i32.load
                                                                                                                          local.set 12
                                                                                                                          local.get 12
                                                                                                                          i32.const 1
                                                                                                                          i32.lt_s
                                                                                                                          local.set 13
                                                                                                                          local.get 13
                                                                                                                          if  ;; label = @60
                                                                                                                            i32.const 3
                                                                                                                            local.set 71
                                                                                                                            br 58 (;@2;)
                                                                                                                          else
                                                                                                                            i32.const 4
                                                                                                                            local.set 71
                                                                                                                            br 58 (;@2;)
                                                                                                                          end
                                                                                                                        end
                                                                                                                        local.get 72
                                                                                                                        global.set 0
                                                                                                                        i32.const 0
                                                                                                                        return
                                                                                                                      end
                                                                                                                      global.get 0
                                                                                                                      local.set 14
                                                                                                                      global.get 0
                                                                                                                      i32.const 1
                                                                                                                      i32.add
                                                                                                                      global.set 0
                                                                                                                      local.get 14
                                                                                                                      i32.const 1
                                                                                                                      i32.store8
                                                                                                                      local.get 7
                                                                                                                      f32.load
                                                                                                                      local.set 15
                                                                                                                      local.get 15
                                                                                                                      call 1
                                                                                                                      local.set 16
                                                                                                                      local.get 16
                                                                                                                      i32.eqz
                                                                                                                      local.set 17
                                                                                                                      local.get 17
                                                                                                                      if  ;; label = @58
                                                                                                                        i32.const 14
                                                                                                                        local.set 71
                                                                                                                        br 56 (;@2;)
                                                                                                                      else
                                                                                                                        i32.const 15
                                                                                                                        local.set 71
                                                                                                                        br 56 (;@2;)
                                                                                                                      end
                                                                                                                    end
                                                                                                                    i32.const 5
                                                                                                                    local.set 71
                                                                                                                    br 54 (;@2;)
                                                                                                                  end
                                                                                                                  local.get 6
                                                                                                                  i32.load
                                                                                                                  local.set 18
                                                                                                                  local.get 18
                                                                                                                  i32.const 4096
                                                                                                                  i32.gt_s
                                                                                                                  local.set 19
                                                                                                                  local.get 11
                                                                                                                  local.get 19
                                                                                                                  i32.store8
                                                                                                                  i32.const 5
                                                                                                                  local.set 71
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                                local.get 11
                                                                                                                i32.load8_u
                                                                                                                local.set 20
                                                                                                                local.get 20
                                                                                                                if  ;; label = @55
                                                                                                                  i32.const 6
                                                                                                                  local.set 71
                                                                                                                  br 53 (;@2;)
                                                                                                                else
                                                                                                                  i32.const 7
                                                                                                                  local.set 71
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                              end
                                                                                                              i32.const 8
                                                                                                              local.set 71
                                                                                                              br 51 (;@2;)
                                                                                                            end
                                                                                                            local.get 9
                                                                                                            i32.load
                                                                                                            local.set 21
                                                                                                            local.get 6
                                                                                                            i32.load
                                                                                                            local.set 22
                                                                                                            local.get 21
                                                                                                            local.get 22
                                                                                                            i32.lt_s
                                                                                                            local.set 23
                                                                                                            local.get 10
                                                                                                            local.get 23
                                                                                                            i32.store8
                                                                                                            i32.const 8
                                                                                                            local.set 71
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          local.get 10
                                                                                                          i32.load8_u
                                                                                                          local.set 24
                                                                                                          local.get 24
                                                                                                          if  ;; label = @52
                                                                                                            i32.const 9
                                                                                                            local.set 71
                                                                                                            br 50 (;@2;)
                                                                                                          else
                                                                                                            i32.const 10
                                                                                                            local.set 71
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                        end
                                                                                                        i32.const 0
                                                                                                        i32.const 1
                                                                                                        i32.sub
                                                                                                        local.set 25
                                                                                                        local.get 72
                                                                                                        global.set 0
                                                                                                        local.get 25
                                                                                                        return
                                                                                                      end
                                                                                                      i32.const 11
                                                                                                      local.set 71
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                    i32.const 2
                                                                                                    local.set 71
                                                                                                    br 46 (;@2;)
                                                                                                  end
                                                                                                  i32.const 11
                                                                                                  local.set 71
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                global.get 0
                                                                                                local.set 26
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 26
                                                                                                i32.const 0
                                                                                                i32.store
                                                                                                i32.const 1
                                                                                                f32.convert_i32_s
                                                                                                local.set 27
                                                                                                local.get 7
                                                                                                f32.load
                                                                                                local.set 28
                                                                                                local.get 27
                                                                                                local.get 28
                                                                                                f32.sub
                                                                                                local.set 29
                                                                                                global.get 0
                                                                                                local.set 30
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 30
                                                                                                local.get 29
                                                                                                f32.store
                                                                                                i32.const 0
                                                                                                f32.convert_i32_s
                                                                                                local.set 31
                                                                                                global.get 0
                                                                                                local.set 32
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 32
                                                                                                local.get 31
                                                                                                f32.store
                                                                                                i32.const 23
                                                                                                local.set 71
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              i32.const 16
                                                                                              local.set 71
                                                                                              br 43 (;@2;)
                                                                                            end
                                                                                            local.get 7
                                                                                            f32.load
                                                                                            local.set 33
                                                                                            i32.const 1
                                                                                            f32.convert_i32_s
                                                                                            local.set 34
                                                                                            local.get 33
                                                                                            local.get 34
                                                                                            f32.eq
                                                                                            local.set 35
                                                                                            local.get 14
                                                                                            local.get 35
                                                                                            i32.store8
                                                                                            i32.const 16
                                                                                            local.set 71
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          local.get 14
                                                                                          i32.load8_u
                                                                                          local.set 36
                                                                                          local.get 36
                                                                                          if  ;; label = @44
                                                                                            i32.const 17
                                                                                            local.set 71
                                                                                            br 42 (;@2;)
                                                                                          else
                                                                                            i32.const 18
                                                                                            local.set 71
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                        end
                                                                                        i32.const 0
                                                                                        i32.const 2
                                                                                        i32.sub
                                                                                        local.set 37
                                                                                        local.get 72
                                                                                        global.set 0
                                                                                        local.get 37
                                                                                        return
                                                                                      end
                                                                                      i32.const 19
                                                                                      local.set 71
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 13
                                                                                    local.set 71
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  i32.const 19
                                                                                  local.set 71
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                local.get 26
                                                                                i32.const 0
                                                                                i32.store
                                                                                i32.const 40
                                                                                local.set 71
                                                                                br 36 (;@2;)
                                                                              end
                                                                              i32.const 21
                                                                              local.set 71
                                                                              br 35 (;@2;)
                                                                            end
                                                                            local.get 26
                                                                            i32.load
                                                                            local.set 38
                                                                            local.get 6
                                                                            i32.load
                                                                            local.set 39
                                                                            local.get 38
                                                                            local.get 39
                                                                            i32.lt_s
                                                                            local.set 40
                                                                            local.get 40
                                                                            if  ;; label = @37
                                                                              i32.const 27
                                                                              local.set 71
                                                                              br 35 (;@2;)
                                                                            else
                                                                              i32.const 28
                                                                              local.set 71
                                                                              br 35 (;@2;)
                                                                            end
                                                                          end
                                                                          i32.const 22
                                                                          local.set 71
                                                                          br 33 (;@2;)
                                                                        end
                                                                        i32.const 23
                                                                        local.set 71
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 25
                                                                      local.set 71
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 5
                                                                    i32.load
                                                                    local.set 41
                                                                    local.get 26
                                                                    i32.load
                                                                    local.set 42
                                                                    local.get 41
                                                                    local.get 42
                                                                    i32.const 4
                                                                    i32.mul
                                                                    i32.add
                                                                    local.set 43
                                                                    local.get 43
                                                                    f32.load
                                                                    local.set 44
                                                                    local.get 44
                                                                    call 0
                                                                    local.set 45
                                                                    local.get 45
                                                                    i32.eqz
                                                                    local.set 46
                                                                    local.get 46
                                                                    if  ;; label = @33
                                                                      i32.const 31
                                                                      local.set 71
                                                                      br 31 (;@2;)
                                                                    else
                                                                      i32.const 32
                                                                      local.set 71
                                                                      br 31 (;@2;)
                                                                    end
                                                                  end
                                                                  i32.const 22
                                                                  local.set 71
                                                                  br 29 (;@2;)
                                                                end
                                                                i32.const 26
                                                                local.set 71
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 26
                                                              i32.load
                                                              local.set 47
                                                              local.get 47
                                                              i32.const 1
                                                              i32.add
                                                              local.set 48
                                                              local.get 26
                                                              local.get 48
                                                              i32.store
                                                              i32.const 35
                                                              local.set 71
                                                              br 27 (;@2;)
                                                            end
                                                            i32.const 0
                                                            i32.const 2
                                                            i32.sub
                                                            local.set 49
                                                            local.get 72
                                                            global.set 0
                                                            local.get 49
                                                            return
                                                          end
                                                          i32.const 33
                                                          local.set 71
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 30
                                                        local.set 71
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 33
                                                      local.set 71
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 29
                                                    local.set 71
                                                    br 22 (;@2;)
                                                  end
                                                  i32.const 29
                                                  local.set 71
                                                  br 21 (;@2;)
                                                end
                                                i32.const 23
                                                local.set 71
                                                br 20 (;@2;)
                                              end
                                              local.get 72
                                              global.set 0
                                              i32.const 0
                                              return
                                            end
                                            i32.const 38
                                            local.set 71
                                            br 18 (;@2;)
                                          end
                                          local.get 26
                                          i32.load
                                          local.set 50
                                          local.get 6
                                          i32.load
                                          local.set 51
                                          local.get 50
                                          local.get 51
                                          i32.lt_s
                                          local.set 52
                                          local.get 52
                                          if  ;; label = @20
                                            i32.const 44
                                            local.set 71
                                            br 18 (;@2;)
                                          else
                                            i32.const 45
                                            local.set 71
                                            br 18 (;@2;)
                                          end
                                        end
                                        i32.const 39
                                        local.set 71
                                        br 16 (;@2;)
                                      end
                                      i32.const 40
                                      local.set 71
                                      br 15 (;@2;)
                                    end
                                    i32.const 42
                                    local.set 71
                                    br 14 (;@2;)
                                  end
                                  local.get 5
                                  i32.load
                                  local.set 53
                                  local.get 26
                                  i32.load
                                  local.set 54
                                  local.get 53
                                  local.get 54
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 55
                                  local.get 55
                                  f32.load
                                  local.set 56
                                  local.get 30
                                  f32.load
                                  local.set 57
                                  local.get 56
                                  local.get 57
                                  f32.div
                                  local.set 58
                                  local.get 32
                                  local.get 58
                                  f32.store
                                  local.get 32
                                  f32.load
                                  local.set 59
                                  local.get 59
                                  call 0
                                  local.set 60
                                  local.get 60
                                  i32.eqz
                                  local.set 61
                                  local.get 61
                                  if  ;; label = @16
                                    i32.const 48
                                    local.set 71
                                    br 14 (;@2;)
                                  else
                                    i32.const 49
                                    local.set 71
                                    br 14 (;@2;)
                                  end
                                end
                                i32.const 39
                                local.set 71
                                br 12 (;@2;)
                              end
                              i32.const 43
                              local.set 71
                              br 11 (;@2;)
                            end
                            local.get 32
                            f32.load
                            local.set 62
                            local.get 8
                            i32.load
                            local.set 63
                            local.get 8
                            i32.load
                            local.set 64
                            local.get 26
                            i32.load
                            local.set 65
                            local.get 8
                            i32.load
                            local.set 66
                            local.get 66
                            local.get 65
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 67
                            local.get 67
                            local.get 62
                            f32.store
                            local.get 26
                            i32.load
                            local.set 68
                            local.get 68
                            i32.const 1
                            i32.add
                            local.set 69
                            local.get 26
                            local.get 69
                            i32.store
                            i32.const 52
                            local.set 71
                            br 10 (;@2;)
                          end
                          i32.const 0
                          i32.const 3
                          i32.sub
                          local.set 70
                          local.get 72
                          global.set 0
                          local.get 70
                          return
                        end
                        i32.const 50
                        local.set 71
                        br 8 (;@2;)
                      end
                      i32.const 47
                      local.set 71
                      br 7 (;@2;)
                    end
                    i32.const 50
                    local.set 71
                    br 6 (;@2;)
                  end
                  i32.const 46
                  local.set 71
                  br 5 (;@2;)
                end
                i32.const 46
                local.set 71
                br 4 (;@2;)
              end
              i32.const 40
              local.set 71
              br 3 (;@2;)
            end
            i32.const 57
            local.set 71
            br 2 (;@2;)
          end
          i32.const 55
          local.set 71
          br 1 (;@2;)
        end
        i32.const 1
        local.set 71
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;7;) (type 3) (param i32 i32 f32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 7
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 6
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                call 6
                local.set 5
                local.get 7
                global.set 0
                local.get 5
                return
              end
              local.get 7
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 6
            br 2 (;@2;)
          end
          i32.const 2
          local.set 6
          br 1 (;@2;)
        end
        i32.const 1
        local.set 6
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;8;) (type 4) (param i32 i32 i32 f32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 f32 f32 f32 f32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 81
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                block  ;; label = @47
                                                                                                  block  ;; label = @48
                                                                                                    block  ;; label = @49
                                                                                                      block  ;; label = @50
                                                                                                        block  ;; label = @51
                                                                                                          block  ;; label = @52
                                                                                                            block  ;; label = @53
                                                                                                              block  ;; label = @54
                                                                                                                block  ;; label = @55
                                                                                                                  block  ;; label = @56
                                                                                                                    block  ;; label = @57
                                                                                                                      block  ;; label = @58
                                                                                                                        block  ;; label = @59
                                                                                                                          block  ;; label = @60
                                                                                                                            local.get 80
                                                                                                                            br_table 0 (;@60;) 1 (;@59;) 2 (;@58;) 3 (;@57;) 4 (;@56;) 5 (;@55;) 6 (;@54;) 7 (;@53;) 8 (;@52;) 9 (;@51;) 10 (;@50;) 11 (;@49;) 12 (;@48;) 13 (;@47;) 14 (;@46;) 15 (;@45;) 16 (;@44;) 17 (;@43;) 18 (;@42;) 19 (;@41;) 20 (;@40;) 21 (;@39;) 22 (;@38;) 23 (;@37;) 24 (;@36;) 25 (;@35;) 26 (;@34;) 27 (;@33;) 28 (;@32;) 29 (;@31;) 30 (;@30;) 31 (;@29;) 32 (;@28;) 33 (;@27;) 34 (;@26;) 35 (;@25;) 36 (;@24;) 37 (;@23;) 38 (;@22;) 39 (;@21;) 40 (;@20;) 41 (;@19;) 42 (;@18;) 43 (;@17;) 44 (;@16;) 45 (;@15;) 46 (;@14;) 47 (;@13;) 48 (;@12;) 49 (;@11;) 50 (;@10;) 51 (;@9;) 52 (;@8;) 53 (;@7;) 54 (;@6;) 55 (;@5;) 56 (;@4;) 57 (;@3;) 59 (;@1;)
                                                                                                                          end
                                                                                                                          global.get 0
                                                                                                                          local.set 6
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 6
                                                                                                                          local.get 0
                                                                                                                          i32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 7
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 7
                                                                                                                          local.get 1
                                                                                                                          i32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 8
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 8
                                                                                                                          local.get 2
                                                                                                                          i32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 9
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 9
                                                                                                                          local.get 3
                                                                                                                          f32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 10
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 10
                                                                                                                          local.get 4
                                                                                                                          i32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 11
                                                                                                                          global.get 0
                                                                                                                          i32.const 4
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 11
                                                                                                                          local.get 5
                                                                                                                          i32.store
                                                                                                                          global.get 0
                                                                                                                          local.set 12
                                                                                                                          global.get 0
                                                                                                                          i32.const 1
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 12
                                                                                                                          i32.const 1
                                                                                                                          i32.store8
                                                                                                                          global.get 0
                                                                                                                          local.set 13
                                                                                                                          global.get 0
                                                                                                                          i32.const 1
                                                                                                                          i32.add
                                                                                                                          global.set 0
                                                                                                                          local.get 13
                                                                                                                          i32.const 1
                                                                                                                          i32.store8
                                                                                                                          local.get 8
                                                                                                                          i32.load
                                                                                                                          local.set 14
                                                                                                                          local.get 14
                                                                                                                          i32.const 1
                                                                                                                          i32.lt_s
                                                                                                                          local.set 15
                                                                                                                          local.get 15
                                                                                                                          if  ;; label = @60
                                                                                                                            i32.const 3
                                                                                                                            local.set 80
                                                                                                                            br 58 (;@2;)
                                                                                                                          else
                                                                                                                            i32.const 4
                                                                                                                            local.set 80
                                                                                                                            br 58 (;@2;)
                                                                                                                          end
                                                                                                                        end
                                                                                                                        local.get 81
                                                                                                                        global.set 0
                                                                                                                        i32.const 0
                                                                                                                        return
                                                                                                                      end
                                                                                                                      local.get 9
                                                                                                                      f32.load
                                                                                                                      local.set 16
                                                                                                                      local.get 16
                                                                                                                      call 1
                                                                                                                      local.set 17
                                                                                                                      local.get 17
                                                                                                                      i32.eqz
                                                                                                                      local.set 18
                                                                                                                      local.get 18
                                                                                                                      if  ;; label = @58
                                                                                                                        i32.const 14
                                                                                                                        local.set 80
                                                                                                                        br 56 (;@2;)
                                                                                                                      else
                                                                                                                        i32.const 15
                                                                                                                        local.set 80
                                                                                                                        br 56 (;@2;)
                                                                                                                      end
                                                                                                                    end
                                                                                                                    i32.const 5
                                                                                                                    local.set 80
                                                                                                                    br 54 (;@2;)
                                                                                                                  end
                                                                                                                  local.get 8
                                                                                                                  i32.load
                                                                                                                  local.set 19
                                                                                                                  local.get 19
                                                                                                                  i32.const 4096
                                                                                                                  i32.gt_s
                                                                                                                  local.set 20
                                                                                                                  local.get 13
                                                                                                                  local.get 20
                                                                                                                  i32.store8
                                                                                                                  i32.const 5
                                                                                                                  local.set 80
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                                local.get 13
                                                                                                                i32.load8_u
                                                                                                                local.set 21
                                                                                                                local.get 21
                                                                                                                if  ;; label = @55
                                                                                                                  i32.const 6
                                                                                                                  local.set 80
                                                                                                                  br 53 (;@2;)
                                                                                                                else
                                                                                                                  i32.const 7
                                                                                                                  local.set 80
                                                                                                                  br 53 (;@2;)
                                                                                                                end
                                                                                                              end
                                                                                                              i32.const 8
                                                                                                              local.set 80
                                                                                                              br 51 (;@2;)
                                                                                                            end
                                                                                                            local.get 11
                                                                                                            i32.load
                                                                                                            local.set 22
                                                                                                            local.get 8
                                                                                                            i32.load
                                                                                                            local.set 23
                                                                                                            local.get 22
                                                                                                            local.get 23
                                                                                                            i32.lt_s
                                                                                                            local.set 24
                                                                                                            local.get 12
                                                                                                            local.get 24
                                                                                                            i32.store8
                                                                                                            i32.const 8
                                                                                                            local.set 80
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                          local.get 12
                                                                                                          i32.load8_u
                                                                                                          local.set 25
                                                                                                          local.get 25
                                                                                                          if  ;; label = @52
                                                                                                            i32.const 9
                                                                                                            local.set 80
                                                                                                            br 50 (;@2;)
                                                                                                          else
                                                                                                            i32.const 10
                                                                                                            local.set 80
                                                                                                            br 50 (;@2;)
                                                                                                          end
                                                                                                        end
                                                                                                        i32.const 0
                                                                                                        i32.const 1
                                                                                                        i32.sub
                                                                                                        local.set 26
                                                                                                        local.get 81
                                                                                                        global.set 0
                                                                                                        local.get 26
                                                                                                        return
                                                                                                      end
                                                                                                      i32.const 11
                                                                                                      local.set 80
                                                                                                      br 47 (;@2;)
                                                                                                    end
                                                                                                    i32.const 2
                                                                                                    local.set 80
                                                                                                    br 46 (;@2;)
                                                                                                  end
                                                                                                  i32.const 11
                                                                                                  local.set 80
                                                                                                  br 45 (;@2;)
                                                                                                end
                                                                                                global.get 0
                                                                                                local.set 27
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 27
                                                                                                i32.const 0
                                                                                                i32.store
                                                                                                i32.const 0
                                                                                                f32.convert_i32_s
                                                                                                local.set 28
                                                                                                global.get 0
                                                                                                local.set 29
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 29
                                                                                                local.get 28
                                                                                                f32.store
                                                                                                i32.const 0
                                                                                                f32.convert_i32_s
                                                                                                local.set 30
                                                                                                global.get 0
                                                                                                local.set 31
                                                                                                global.get 0
                                                                                                i32.const 4
                                                                                                i32.add
                                                                                                global.set 0
                                                                                                local.get 31
                                                                                                local.get 30
                                                                                                f32.store
                                                                                                i32.const 20
                                                                                                local.set 80
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                              i32.const 0
                                                                                              i32.const 2
                                                                                              i32.sub
                                                                                              local.set 32
                                                                                              local.get 81
                                                                                              global.set 0
                                                                                              local.get 32
                                                                                              return
                                                                                            end
                                                                                            i32.const 16
                                                                                            local.set 80
                                                                                            br 42 (;@2;)
                                                                                          end
                                                                                          i32.const 13
                                                                                          local.set 80
                                                                                          br 41 (;@2;)
                                                                                        end
                                                                                        i32.const 16
                                                                                        local.set 80
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      local.get 27
                                                                                      i32.const 0
                                                                                      i32.store
                                                                                      i32.const 40
                                                                                      local.set 80
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    i32.const 18
                                                                                    local.set 80
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                  local.get 27
                                                                                  i32.load
                                                                                  local.set 33
                                                                                  local.get 8
                                                                                  i32.load
                                                                                  local.set 34
                                                                                  local.get 33
                                                                                  local.get 34
                                                                                  i32.lt_s
                                                                                  local.set 35
                                                                                  local.get 35
                                                                                  if  ;; label = @40
                                                                                    i32.const 24
                                                                                    local.set 80
                                                                                    br 38 (;@2;)
                                                                                  else
                                                                                    i32.const 25
                                                                                    local.set 80
                                                                                    br 38 (;@2;)
                                                                                  end
                                                                                end
                                                                                i32.const 19
                                                                                local.set 80
                                                                                br 36 (;@2;)
                                                                              end
                                                                              i32.const 20
                                                                              local.set 80
                                                                              br 35 (;@2;)
                                                                            end
                                                                            i32.const 22
                                                                            local.set 80
                                                                            br 34 (;@2;)
                                                                          end
                                                                          global.get 0
                                                                          local.set 36
                                                                          global.get 0
                                                                          i32.const 1
                                                                          i32.add
                                                                          global.set 0
                                                                          local.get 36
                                                                          i32.const 1
                                                                          i32.store8
                                                                          local.get 6
                                                                          i32.load
                                                                          local.set 37
                                                                          local.get 27
                                                                          i32.load
                                                                          local.set 38
                                                                          local.get 37
                                                                          local.get 38
                                                                          i32.const 4
                                                                          i32.mul
                                                                          i32.add
                                                                          local.set 39
                                                                          local.get 39
                                                                          f32.load
                                                                          local.set 40
                                                                          local.get 40
                                                                          call 0
                                                                          local.set 41
                                                                          local.get 41
                                                                          i32.eqz
                                                                          local.set 42
                                                                          local.get 42
                                                                          if  ;; label = @36
                                                                            i32.const 28
                                                                            local.set 80
                                                                            br 34 (;@2;)
                                                                          else
                                                                            i32.const 29
                                                                            local.set 80
                                                                            br 34 (;@2;)
                                                                          end
                                                                        end
                                                                        i32.const 19
                                                                        local.set 80
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 23
                                                                      local.set 80
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 27
                                                                    i32.load
                                                                    local.set 43
                                                                    local.get 43
                                                                    i32.const 1
                                                                    i32.add
                                                                    local.set 44
                                                                    local.get 27
                                                                    local.get 44
                                                                    i32.store
                                                                    i32.const 35
                                                                    local.set 80
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 30
                                                                  local.set 80
                                                                  br 29 (;@2;)
                                                                end
                                                                local.get 7
                                                                i32.load
                                                                local.set 45
                                                                local.get 27
                                                                i32.load
                                                                local.set 46
                                                                local.get 45
                                                                local.get 46
                                                                i32.const 4
                                                                i32.mul
                                                                i32.add
                                                                local.set 47
                                                                local.get 47
                                                                f32.load
                                                                local.set 48
                                                                local.get 48
                                                                call 0
                                                                local.set 49
                                                                local.get 49
                                                                i32.eqz
                                                                local.set 50
                                                                local.get 36
                                                                local.get 50
                                                                i32.store8
                                                                i32.const 30
                                                                local.set 80
                                                                br 28 (;@2;)
                                                              end
                                                              local.get 36
                                                              i32.load8_u
                                                              local.set 51
                                                              local.get 51
                                                              if  ;; label = @30
                                                                i32.const 31
                                                                local.set 80
                                                                br 28 (;@2;)
                                                              else
                                                                i32.const 32
                                                                local.set 80
                                                                br 28 (;@2;)
                                                              end
                                                            end
                                                            i32.const 0
                                                            i32.const 2
                                                            i32.sub
                                                            local.set 52
                                                            local.get 81
                                                            global.set 0
                                                            local.get 52
                                                            return
                                                          end
                                                          i32.const 33
                                                          local.set 80
                                                          br 25 (;@2;)
                                                        end
                                                        i32.const 27
                                                        local.set 80
                                                        br 24 (;@2;)
                                                      end
                                                      i32.const 33
                                                      local.set 80
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 26
                                                    local.set 80
                                                    br 22 (;@2;)
                                                  end
                                                  i32.const 26
                                                  local.set 80
                                                  br 21 (;@2;)
                                                end
                                                i32.const 20
                                                local.set 80
                                                br 20 (;@2;)
                                              end
                                              local.get 81
                                              global.set 0
                                              i32.const 0
                                              return
                                            end
                                            i32.const 38
                                            local.set 80
                                            br 18 (;@2;)
                                          end
                                          local.get 27
                                          i32.load
                                          local.set 53
                                          local.get 8
                                          i32.load
                                          local.set 54
                                          local.get 53
                                          local.get 54
                                          i32.lt_s
                                          local.set 55
                                          local.get 55
                                          if  ;; label = @20
                                            i32.const 44
                                            local.set 80
                                            br 18 (;@2;)
                                          else
                                            i32.const 45
                                            local.set 80
                                            br 18 (;@2;)
                                          end
                                        end
                                        i32.const 39
                                        local.set 80
                                        br 16 (;@2;)
                                      end
                                      i32.const 40
                                      local.set 80
                                      br 15 (;@2;)
                                    end
                                    i32.const 42
                                    local.set 80
                                    br 14 (;@2;)
                                  end
                                  local.get 7
                                  i32.load
                                  local.set 56
                                  local.get 27
                                  i32.load
                                  local.set 57
                                  local.get 56
                                  local.get 57
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 58
                                  local.get 58
                                  f32.load
                                  local.set 59
                                  local.get 9
                                  f32.load
                                  local.set 60
                                  local.get 59
                                  local.get 60
                                  f32.mul
                                  local.set 61
                                  local.get 29
                                  local.get 61
                                  f32.store
                                  local.get 6
                                  i32.load
                                  local.set 62
                                  local.get 27
                                  i32.load
                                  local.set 63
                                  local.get 62
                                  local.get 63
                                  i32.const 4
                                  i32.mul
                                  i32.add
                                  local.set 64
                                  local.get 64
                                  f32.load
                                  local.set 65
                                  local.get 29
                                  f32.load
                                  local.set 66
                                  local.get 65
                                  local.get 66
                                  f32.sub
                                  local.set 67
                                  local.get 31
                                  local.get 67
                                  f32.store
                                  local.get 31
                                  f32.load
                                  local.set 68
                                  local.get 68
                                  call 0
                                  local.set 69
                                  local.get 69
                                  i32.eqz
                                  local.set 70
                                  local.get 70
                                  if  ;; label = @16
                                    i32.const 48
                                    local.set 80
                                    br 14 (;@2;)
                                  else
                                    i32.const 49
                                    local.set 80
                                    br 14 (;@2;)
                                  end
                                end
                                i32.const 39
                                local.set 80
                                br 12 (;@2;)
                              end
                              i32.const 43
                              local.set 80
                              br 11 (;@2;)
                            end
                            local.get 31
                            f32.load
                            local.set 71
                            local.get 10
                            i32.load
                            local.set 72
                            local.get 10
                            i32.load
                            local.set 73
                            local.get 27
                            i32.load
                            local.set 74
                            local.get 10
                            i32.load
                            local.set 75
                            local.get 75
                            local.get 74
                            i32.const 4
                            i32.mul
                            i32.add
                            local.set 76
                            local.get 76
                            local.get 71
                            f32.store
                            local.get 27
                            i32.load
                            local.set 77
                            local.get 77
                            i32.const 1
                            i32.add
                            local.set 78
                            local.get 27
                            local.get 78
                            i32.store
                            i32.const 52
                            local.set 80
                            br 10 (;@2;)
                          end
                          i32.const 0
                          i32.const 3
                          i32.sub
                          local.set 79
                          local.get 81
                          global.set 0
                          local.get 79
                          return
                        end
                        i32.const 50
                        local.set 80
                        br 8 (;@2;)
                      end
                      i32.const 47
                      local.set 80
                      br 7 (;@2;)
                    end
                    i32.const 50
                    local.set 80
                    br 6 (;@2;)
                  end
                  i32.const 46
                  local.set 80
                  br 5 (;@2;)
                end
                i32.const 46
                local.set 80
                br 4 (;@2;)
              end
              i32.const 40
              local.set 80
              br 3 (;@2;)
            end
            i32.const 57
            local.set 80
            br 2 (;@2;)
          end
          i32.const 55
          local.set 80
          br 1 (;@2;)
        end
        i32.const 1
        local.set 80
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;9;) (type 4) (param i32 i32 i32 f32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 8
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 7
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                local.get 4
                local.get 5
                call 8
                local.set 6
                local.get 8
                global.set 0
                local.get 6
                return
              end
              local.get 8
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 7
            br 2 (;@2;)
          end
          i32.const 2
          local.set 7
          br 1 (;@2;)
        end
        i32.const 1
        local.set 7
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;10;) (type 5) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    global.get 0
    local.set 50
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    block  ;; label = @9
                      block  ;; label = @10
                        block  ;; label = @11
                          block  ;; label = @12
                            block  ;; label = @13
                              block  ;; label = @14
                                block  ;; label = @15
                                  block  ;; label = @16
                                    block  ;; label = @17
                                      block  ;; label = @18
                                        block  ;; label = @19
                                          block  ;; label = @20
                                            block  ;; label = @21
                                              block  ;; label = @22
                                                block  ;; label = @23
                                                  block  ;; label = @24
                                                    block  ;; label = @25
                                                      block  ;; label = @26
                                                        block  ;; label = @27
                                                          block  ;; label = @28
                                                            block  ;; label = @29
                                                              block  ;; label = @30
                                                                block  ;; label = @31
                                                                  block  ;; label = @32
                                                                    block  ;; label = @33
                                                                      block  ;; label = @34
                                                                        block  ;; label = @35
                                                                          block  ;; label = @36
                                                                            block  ;; label = @37
                                                                              block  ;; label = @38
                                                                                block  ;; label = @39
                                                                                  block  ;; label = @40
                                                                                    block  ;; label = @41
                                                                                      block  ;; label = @42
                                                                                        block  ;; label = @43
                                                                                          block  ;; label = @44
                                                                                            block  ;; label = @45
                                                                                              block  ;; label = @46
                                                                                                local.get 49
                                                                                                br_table 0 (;@46;) 1 (;@45;) 2 (;@44;) 3 (;@43;) 4 (;@42;) 5 (;@41;) 6 (;@40;) 7 (;@39;) 8 (;@38;) 9 (;@37;) 10 (;@36;) 11 (;@35;) 12 (;@34;) 13 (;@33;) 14 (;@32;) 15 (;@31;) 16 (;@30;) 17 (;@29;) 18 (;@28;) 19 (;@27;) 20 (;@26;) 21 (;@25;) 22 (;@24;) 23 (;@23;) 24 (;@22;) 25 (;@21;) 26 (;@20;) 27 (;@19;) 28 (;@18;) 29 (;@17;) 30 (;@16;) 31 (;@15;) 32 (;@14;) 33 (;@13;) 34 (;@12;) 35 (;@11;) 36 (;@10;) 37 (;@9;) 38 (;@8;) 39 (;@7;) 40 (;@6;) 41 (;@5;) 42 (;@4;) 43 (;@3;) 45 (;@1;)
                                                                                              end
                                                                                              global.get 0
                                                                                              local.set 4
                                                                                              global.get 0
                                                                                              i32.const 4
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 4
                                                                                              local.get 0
                                                                                              i32.store
                                                                                              global.get 0
                                                                                              local.set 5
                                                                                              global.get 0
                                                                                              i32.const 4
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 5
                                                                                              local.get 1
                                                                                              i32.store
                                                                                              global.get 0
                                                                                              local.set 6
                                                                                              global.get 0
                                                                                              i32.const 4
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 6
                                                                                              local.get 2
                                                                                              i32.store
                                                                                              global.get 0
                                                                                              local.set 7
                                                                                              global.get 0
                                                                                              i32.const 4
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 7
                                                                                              local.get 3
                                                                                              i32.store
                                                                                              global.get 0
                                                                                              local.set 8
                                                                                              global.get 0
                                                                                              i32.const 1
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 8
                                                                                              i32.const 1
                                                                                              i32.store8
                                                                                              global.get 0
                                                                                              local.set 9
                                                                                              global.get 0
                                                                                              i32.const 1
                                                                                              i32.add
                                                                                              global.set 0
                                                                                              local.get 9
                                                                                              i32.const 1
                                                                                              i32.store8
                                                                                              local.get 5
                                                                                              i32.load
                                                                                              local.set 10
                                                                                              local.get 10
                                                                                              i32.const 1
                                                                                              i32.lt_s
                                                                                              local.set 11
                                                                                              local.get 11
                                                                                              if  ;; label = @46
                                                                                                i32.const 3
                                                                                                local.set 49
                                                                                                br 44 (;@2;)
                                                                                              else
                                                                                                i32.const 4
                                                                                                local.set 49
                                                                                                br 44 (;@2;)
                                                                                              end
                                                                                            end
                                                                                            local.get 50
                                                                                            global.set 0
                                                                                            i32.const 0
                                                                                            return
                                                                                          end
                                                                                          global.get 0
                                                                                          local.set 12
                                                                                          global.get 0
                                                                                          i32.const 4
                                                                                          i32.add
                                                                                          global.set 0
                                                                                          local.get 12
                                                                                          i32.const 0
                                                                                          i32.store
                                                                                          i32.const 15
                                                                                          local.set 49
                                                                                          br 41 (;@2;)
                                                                                        end
                                                                                        i32.const 5
                                                                                        local.set 49
                                                                                        br 40 (;@2;)
                                                                                      end
                                                                                      local.get 5
                                                                                      i32.load
                                                                                      local.set 13
                                                                                      local.get 13
                                                                                      i32.const 4096
                                                                                      i32.gt_s
                                                                                      local.set 14
                                                                                      local.get 9
                                                                                      local.get 14
                                                                                      i32.store8
                                                                                      i32.const 5
                                                                                      local.set 49
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                    local.get 9
                                                                                    i32.load8_u
                                                                                    local.set 15
                                                                                    local.get 15
                                                                                    if  ;; label = @41
                                                                                      i32.const 6
                                                                                      local.set 49
                                                                                      br 39 (;@2;)
                                                                                    else
                                                                                      i32.const 7
                                                                                      local.set 49
                                                                                      br 39 (;@2;)
                                                                                    end
                                                                                  end
                                                                                  i32.const 8
                                                                                  local.set 49
                                                                                  br 37 (;@2;)
                                                                                end
                                                                                local.get 7
                                                                                i32.load
                                                                                local.set 16
                                                                                local.get 5
                                                                                i32.load
                                                                                local.set 17
                                                                                local.get 16
                                                                                local.get 17
                                                                                i32.lt_s
                                                                                local.set 18
                                                                                local.get 8
                                                                                local.get 18
                                                                                i32.store8
                                                                                i32.const 8
                                                                                local.set 49
                                                                                br 36 (;@2;)
                                                                              end
                                                                              local.get 8
                                                                              i32.load8_u
                                                                              local.set 19
                                                                              local.get 19
                                                                              if  ;; label = @38
                                                                                i32.const 9
                                                                                local.set 49
                                                                                br 36 (;@2;)
                                                                              else
                                                                                i32.const 10
                                                                                local.set 49
                                                                                br 36 (;@2;)
                                                                              end
                                                                            end
                                                                            i32.const 0
                                                                            i32.const 1
                                                                            i32.sub
                                                                            local.set 20
                                                                            local.get 50
                                                                            global.set 0
                                                                            local.get 20
                                                                            return
                                                                          end
                                                                          i32.const 11
                                                                          local.set 49
                                                                          br 33 (;@2;)
                                                                        end
                                                                        i32.const 2
                                                                        local.set 49
                                                                        br 32 (;@2;)
                                                                      end
                                                                      i32.const 11
                                                                      local.set 49
                                                                      br 31 (;@2;)
                                                                    end
                                                                    local.get 12
                                                                    i32.const 0
                                                                    i32.store
                                                                    i32.const 32
                                                                    local.set 49
                                                                    br 30 (;@2;)
                                                                  end
                                                                  i32.const 13
                                                                  local.set 49
                                                                  br 29 (;@2;)
                                                                end
                                                                local.get 12
                                                                i32.load
                                                                local.set 21
                                                                local.get 5
                                                                i32.load
                                                                local.set 22
                                                                local.get 21
                                                                local.get 22
                                                                i32.lt_s
                                                                local.set 23
                                                                local.get 23
                                                                if  ;; label = @31
                                                                  i32.const 19
                                                                  local.set 49
                                                                  br 29 (;@2;)
                                                                else
                                                                  i32.const 20
                                                                  local.set 49
                                                                  br 29 (;@2;)
                                                                end
                                                              end
                                                              i32.const 14
                                                              local.set 49
                                                              br 27 (;@2;)
                                                            end
                                                            i32.const 15
                                                            local.set 49
                                                            br 26 (;@2;)
                                                          end
                                                          i32.const 17
                                                          local.set 49
                                                          br 25 (;@2;)
                                                        end
                                                        local.get 4
                                                        i32.load
                                                        local.set 24
                                                        local.get 12
                                                        i32.load
                                                        local.set 25
                                                        local.get 24
                                                        local.get 25
                                                        i32.const 4
                                                        i32.mul
                                                        i32.add
                                                        local.set 26
                                                        local.get 26
                                                        f32.load
                                                        local.set 27
                                                        local.get 27
                                                        call 1
                                                        local.set 28
                                                        local.get 28
                                                        i32.eqz
                                                        local.set 29
                                                        local.get 29
                                                        if  ;; label = @27
                                                          i32.const 23
                                                          local.set 49
                                                          br 25 (;@2;)
                                                        else
                                                          i32.const 24
                                                          local.set 49
                                                          br 25 (;@2;)
                                                        end
                                                      end
                                                      i32.const 14
                                                      local.set 49
                                                      br 23 (;@2;)
                                                    end
                                                    i32.const 18
                                                    local.set 49
                                                    br 22 (;@2;)
                                                  end
                                                  local.get 12
                                                  i32.load
                                                  local.set 30
                                                  local.get 30
                                                  i32.const 1
                                                  i32.add
                                                  local.set 31
                                                  local.get 12
                                                  local.get 31
                                                  i32.store
                                                  i32.const 27
                                                  local.set 49
                                                  br 21 (;@2;)
                                                end
                                                i32.const 0
                                                i32.const 2
                                                i32.sub
                                                local.set 32
                                                local.get 50
                                                global.set 0
                                                local.get 32
                                                return
                                              end
                                              i32.const 25
                                              local.set 49
                                              br 19 (;@2;)
                                            end
                                            i32.const 22
                                            local.set 49
                                            br 18 (;@2;)
                                          end
                                          i32.const 25
                                          local.set 49
                                          br 17 (;@2;)
                                        end
                                        i32.const 21
                                        local.set 49
                                        br 16 (;@2;)
                                      end
                                      i32.const 21
                                      local.set 49
                                      br 15 (;@2;)
                                    end
                                    i32.const 15
                                    local.set 49
                                    br 14 (;@2;)
                                  end
                                  local.get 50
                                  global.set 0
                                  i32.const 0
                                  return
                                end
                                i32.const 30
                                local.set 49
                                br 12 (;@2;)
                              end
                              local.get 12
                              i32.load
                              local.set 33
                              local.get 5
                              i32.load
                              local.set 34
                              local.get 33
                              local.get 34
                              i32.lt_s
                              local.set 35
                              local.get 35
                              if  ;; label = @14
                                i32.const 36
                                local.set 49
                                br 12 (;@2;)
                              else
                                i32.const 37
                                local.set 49
                                br 12 (;@2;)
                              end
                            end
                            i32.const 31
                            local.set 49
                            br 10 (;@2;)
                          end
                          i32.const 32
                          local.set 49
                          br 9 (;@2;)
                        end
                        i32.const 34
                        local.set 49
                        br 8 (;@2;)
                      end
                      local.get 4
                      i32.load
                      local.set 36
                      local.get 12
                      i32.load
                      local.set 37
                      local.get 36
                      local.get 37
                      i32.const 4
                      i32.mul
                      i32.add
                      local.set 38
                      local.get 38
                      f32.load
                      local.set 39
                      i32.const 1000
                      f32.convert_i32_s
                      local.set 40
                      local.get 39
                      local.get 40
                      f32.mul
                      local.set 41
                      local.get 6
                      i32.load
                      local.set 42
                      local.get 6
                      i32.load
                      local.set 43
                      local.get 12
                      i32.load
                      local.set 44
                      local.get 6
                      i32.load
                      local.set 45
                      local.get 45
                      local.get 44
                      i32.const 4
                      i32.mul
                      i32.add
                      local.set 46
                      local.get 46
                      local.get 41
                      f32.store
                      local.get 12
                      i32.load
                      local.set 47
                      local.get 47
                      i32.const 1
                      i32.add
                      local.set 48
                      local.get 12
                      local.get 48
                      i32.store
                      i32.const 38
                      local.set 49
                      br 7 (;@2;)
                    end
                    i32.const 31
                    local.set 49
                    br 6 (;@2;)
                  end
                  i32.const 35
                  local.set 49
                  br 5 (;@2;)
                end
                i32.const 38
                local.set 49
                br 4 (;@2;)
              end
              i32.const 32
              local.set 49
              br 3 (;@2;)
            end
            i32.const 43
            local.set 49
            br 2 (;@2;)
          end
          i32.const 41
          local.set 49
          br 1 (;@2;)
        end
        i32.const 1
        local.set 49
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;11;) (type 5) (param i32 i32 i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 6
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 5
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.get 1
                local.get 2
                local.get 3
                call 10
                local.set 4
                local.get 6
                global.set 0
                local.get 4
                return
              end
              local.get 6
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 5
            br 2 (;@2;)
          end
          i32.const 2
          local.set 5
          br 1 (;@2;)
        end
        i32.const 1
        local.set 5
        br 0 (;@2;)
      end
    end
    unreachable)
  (func (;12;) (type 6) (param i32 i32) (result i32)
    (local i32 i32 i32)
    global.get 0
    local.set 4
    block  ;; label = @1
      loop  ;; label = @2
        block  ;; label = @3
          block  ;; label = @4
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  local.get 3
                  br_table 0 (;@7;) 1 (;@6;) 2 (;@5;) 3 (;@4;) 4 (;@3;) 6 (;@1;)
                end
                local.get 0
                local.set 2
                local.get 4
                global.set 0
                i32.const 0
                return
              end
              local.get 4
              global.set 0
              i32.const 0
              return
            end
            i32.const 4
            local.set 3
            br 2 (;@2;)
          end
          i32.const 2
          local.set 3
          br 1 (;@2;)
        end
        i32.const 1
        local.set 3
        br 0 (;@2;)
      end
    end
    unreachable)
  (table (;0;) 13 13 funcref)
  (memory (;0;) 16)
  (global (;0;) (mut i32) (i32.const 65536))
  (global (;1;) (mut i32) (i32.const 196608))
  (global (;2;) (mut i32) (i32.const 0))
  (global (;3;) (mut i32) (i32.const 0))
  (global (;4;) (mut i32) (i32.const -1))
  (global (;5;) (mut i32) (i32.const 0))
  (global (;6;) (mut i32) (i32.const 0))
  (global (;7;) (mut i32) (i32.const 0))
  (global (;8;) (mut i32) (i32.const 0))
  (global (;9;) (mut i32) (i32.const 0))
  (global (;10;) (mut i32) (i32.const 0))
  (export "memory" (memory 0))
  (export "__hike_sp" (global 0))
  (export "__hike_heap" (global 1))
  (export "Finite" (func 0))
  (export "SigmaValid" (func 1))
  (export "__hike_impl_FlowSchedule" (func 2))
  (export "FlowSchedule" (func 3))
  (export "__hike_impl_ConstNoiseMix" (func 4))
  (export "ConstNoiseMix" (func 5))
  (export "__hike_impl_ConstInverse" (func 6))
  (export "ConstInverse" (func 7))
  (export "__hike_impl_FlowDenoised" (func 8))
  (export "FlowDenoised" (func 9))
  (export "__hike_impl_FlowTimesteps" (func 10))
  (export "FlowTimesteps" (func 11))
  (export "main" (func 12))
  (elem (;0;) (i32.const 0) func 0 1 2 3 4 5 6 7 8 9 10 11 12))
